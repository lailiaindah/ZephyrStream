// Stream scheduler — background job that auto-starts streams when their
// scheduled startAt time arrives, and auto-creates next-day schedules when
// a stream with autoCreateSchedule ends or errors.
//
// This runs as an in-memory interval. For production, consider a more
// robust queue (BullMQ / cron) — but for a single-VPS deployment this
// is sufficient and simple.

import { db } from "@/lib/db";
import { startFFmpegStream, isProcessRunning } from "@/lib/ffmpeg";
import { createOrUpdateBroadcast, uploadThumbnail, pickTitleAndThumbnail, refreshAccessToken } from "@/lib/youtube";
import { runCleanupIfNeeded } from "@/lib/cleanup";
import { runBackupIfNeeded } from "@/lib/backup";
import { resolveVideoFiles, shouldShuffleQueue, shuffleArray } from "@/lib/video-source";
import { checkSystemThresholds } from "@/lib/threshold-alerts";

const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

// Main scheduler loop
async function schedulerTick() {
  if (isRunning) return; // prevent overlapping runs
  isRunning = true;

  try {
    // Run sequentially to avoid race conditions between auto-stop and
    // ghost-cleanup operating on the same stream in parallel.
    await autoStartScheduledStreams();
    await autoStopExpiredStreams();
    await cleanupGhostStreams();
    await refreshExpiringTokens();
    // Cleanup runs at most once per hour (throttled internally)
    await runCleanupIfNeeded();
    // Backup runs at most once per day (throttled internally)
    await runBackupIfNeeded();
    // Check system thresholds (disk/RAM/log/upload) every tick
    await checkSystemThresholds().catch(() => {});
  } catch (err) {
    console.error("[Scheduler] Tick error:", err);
  } finally {
    isRunning = false;
  }
}

// 1. Auto-start streams whose startAt has arrived
async function autoStartScheduledStreams() {
  const now = new Date();

  // Find scheduled streams with startAt in the past (or now)
  const due = await db.stream.findMany({
    where: {
      status: "scheduled",
      startAt: { lte: now },
    },
    include: { channel: true },
    take: 5,
  });

  for (const stream of due) {
    try {
      await startStreamInternal(stream);
    } catch (err: any) {
      console.error(`[Scheduler] Failed to auto-start stream ${stream.id}:`, err.message);
      await db.stream.update({
        where: { id: stream.id },
        data: { status: "error", lastError: err.message },
      });
      // If autoCreateSchedule is on, create next-day schedule even on error
      if (stream.autoCreateSchedule) {
        await createNextDaySchedule(stream);
      }
    }
  }
}

// 2. Auto-stop streams that have exceeded their max duration
async function autoStopExpiredStreams() {
  const now = new Date();

  const live = await db.stream.findMany({
    where: { status: "live", startedAt: { not: null } },
  });

  for (const stream of live) {
    if (!stream.startedAt) continue;

    // Compute the max allowed duration in seconds
    const maxSec = stream.maxHours * 3600;
    const elapsedSec = (now.getTime() - stream.startedAt.getTime()) / 1000;

    if (elapsedSec >= maxSec) {
      try {
        await stopStreamInternal(stream);
        console.log(`[Scheduler] Auto-stopped stream ${stream.id} (exceeded ${stream.maxHours}h)`);
      } catch (err: any) {
        console.error(`[Scheduler] Failed to auto-stop stream ${stream.id}:`, err.message);
      }
    }
  }
}

// 3. Cleanup "ghost" live streams — status is live but FFmpeg process is dead.
// Includes AUTO-RESTART logic: if the stream hasn't exceeded max retries,
// restart FFmpeg automatically with exponential backoff.
//
// We look for streams in TWO conditions:
//   (a) status=live AND pid is set AND that pid is no longer running
//       (FFmpeg crashed or was killed externally)
//   (b) status=live AND pid is null (server restarted during a retry
//       backoff window — the setTimeout was lost, leaving the stream
//       stuck "live" with no process. Previously this case was never
//       found because the query required pid != null.)
async function cleanupGhostStreams() {
  // Fetch all live streams (with or without pid) — we'll filter below
  const live = await db.stream.findMany({
    where: { status: "live" },
    include: { channel: true },
  });

  for (const stream of live) {
    // Determine if this stream is a "ghost":
    //   - pid is null (stuck after server restart during retry backoff), OR
    //   - pid is set but the process is no longer running (FFmpeg crashed)
    const isGhost = !stream.pid || !isProcessRunning(stream.pid);
    if (!isGhost) continue;

    // If pid is null AND we recently scheduled a retry (within the last
    // 90s), skip — the setTimeout is still pending. This prevents the
    // scheduler from scheduling duplicate retries every 30s tick while
    // we wait for the backoff to expire.
    if (!stream.pid && stream.retryCount > 0) {
      const ageMs = Date.now() - (stream.updatedAt?.getTime() || 0);
      if (ageMs < 90_000) {
        continue; // retry still pending
      }
    }

    console.log(
      `[Scheduler] Ghost stream detected: ${stream.id} ` +
      `(PID ${stream.pid ?? "null"} dead/stuck)`
    );

    // Check if we should auto-restart (max 3 retries)
    const retryCount = stream.retryCount || 0;
    const MAX_RETRIES = 3;

    if (retryCount < MAX_RETRIES) {
      // Auto-restart with exponential backoff
      const backoffSec = Math.min(5 * Math.pow(2, retryCount), 60); // 5s, 10s, 20s, max 60s
      console.log(
        `[Scheduler] Auto-restart attempt ${retryCount + 1}/${MAX_RETRIES} ` +
        `for stream ${stream.id} in ${backoffSec}s`
      );

      await db.stream.update({
        where: { id: stream.id },
        data: {
          pid: null,
          retryCount: retryCount + 1,
          lastError: `FFmpeg crashed — auto-retry ${retryCount + 1}/${MAX_RETRIES} in ${backoffSec}s`,
        },
      });

      await db.activityLog.create({
        data: {
          userId: stream.userId,
          level: "warn",
          category: "stream",
          message: `Auto-restart ${retryCount + 1}/${MAX_RETRIES}: ${stream.name}`,
          details: `FFmpeg process died. Retrying in ${backoffSec}s.`,
        },
      }).catch(() => {});

      // Schedule the restart after backoff
      setTimeout(async () => {
        try {
          await retryStreamStart(stream, retryCount + 1);
        } catch (err: any) {
          console.error(`[Scheduler] Auto-restart failed for ${stream.id}:`, err.message);
        }
      }, backoffSec * 1000);

      continue; // Skip the "mark as ended" logic below
    }

    // Max retries exceeded — mark as ended
    console.log(`[Scheduler] Max retries (${MAX_RETRIES}) exceeded for stream ${stream.id}, marking as ended`);

    await db.stream.update({
      where: { id: stream.id },
      data: {
        status: "ended",
        endedAt: new Date(),
        pid: null,
        lastError: `FFmpeg process died after ${MAX_RETRIES} retry attempts`,
      },
    });

    await db.activityLog.create({
      data: {
        userId: stream.userId,
        level: "error",
        category: "stream",
        message: `Stream failed after ${MAX_RETRIES} retries: ${stream.name}`,
        details: "FFmpeg crashed repeatedly. Auto-create next-day schedule if enabled.",
      },
    }).catch(() => {});

    // If autoCreateSchedule is on, create the next-day schedule
    if (stream.autoCreateSchedule) {
      await createNextDaySchedule(stream);
    }
  }
}

// Retry starting a stream after FFmpeg crash
async function retryStreamStart(stream: any, retryCount: number) {
  // Re-fetch to check if stream was manually stopped while we were waiting.
  // CRITICAL: also bail if the stream is already "live" with a valid PID —
  // this happens when the user manually clicks "Start" during the backoff
  // window. Without this check, the retry would spawn a SECOND FFmpeg
  // process and overwrite the PID, leaving the first one as an untracked
  // zombie pushing to the same RTMP URL.
  const fresh = await db.stream.findUnique({ where: { id: stream.id } });
  if (!fresh || fresh.status === "ended" || fresh.status === "error") {
    console.log(`[Scheduler] Stream ${stream.id} was stopped during backoff, aborting retry`);
    return;
  }
  if (fresh.status === "live" && fresh.pid) {
    console.log(`[Scheduler] Stream ${stream.id} is already live with PID ${fresh.pid}, aborting retry`);
    return;
  }

  // Resolve video files (combines individual files + playlist expansion).
  // Pass userId so resolveVideoFiles filters out any cross-user file/playlist IDs.
  const resolved = await resolveVideoFiles({
    sourceType: fresh.sourceType,
    sourcePath: fresh.sourcePath,
    sourceFileIds: fresh.sourceFileIds,
    playlistSourceIds: fresh.playlistSourceIds,
    userId: fresh.userId,
  });
  const videoFiles = resolved.videoFiles;

  if (videoFiles.length === 0) {
    throw new Error("No video files found for retry");
  }

  // Shuffle if enabled (or if any selected playlist forces shuffle)
  if (shouldShuffleQueue(fresh.shuffle, resolved) && videoFiles.length > 1) {
    shuffleArray(videoFiles);
    console.log(
      `[Scheduler] Shuffled ${videoFiles.length} video files for retry ` +
      `(${resolved.individualCount} individual + ${resolved.playlistCount} from ${resolved.playlistExpandedCount} playlist(s))`
    );
  }

  const minSec = fresh.minHours * 3600;
  const maxSec = fresh.maxHours * 3600;
  const randomDurationSec = Math.round(minSec + Math.random() * (maxSec - minSec));

  const { pid, logFile } = await startFFmpegStream({
    streamKey: fresh.streamKey,
    rtmpUrl: fresh.rtmpUrl,
    videoFiles,
    encoder: fresh.encoder,
    copyMode: fresh.copyMode,
    videoBitrate: fresh.videoBitrate,
    audioBitrate: fresh.audioBitrate,
    resolution: fresh.resolution,
    fps: fresh.fps,
    preset: fresh.preset,
    durationSeconds: randomDurationSec,
    logFile: undefined,
  });

  await db.stream.update({
    where: { id: fresh.id },
    data: {
      pid,
      logFile,
      lastError: null,
    },
  });

  await db.activityLog.create({
    data: {
      userId: fresh.userId,
      level: "success",
      category: "stream",
      message: `Auto-restart succeeded: ${fresh.name} (attempt ${retryCount})`,
      details: `New PID: ${pid}`,
    },
  }).catch(() => {});

  console.log(`[Scheduler] Auto-restart succeeded for stream ${fresh.id}, new PID: ${pid}`);
}

// 4. Proactively refresh access tokens that will expire soon.
// Google access tokens last 1 hour. We refresh any token that will
// expire within the next 10 minutes — this prevents "re-authorize"
// prompts and ensures scheduled streams can start without auth issues.
// The refresh token itself does NOT expire (unless revoked by the user),
// so as long as we keep refreshing access tokens, the channel stays
// authenticated indefinitely.
async function refreshExpiringTokens() {
  // Refresh window: 10 minutes from now
  const refreshBefore = new Date(Date.now() + 10 * 60 * 1000);

  // Find channels with tokens expiring soon
  const channels = await db.channel.findMany({
    where: {
      status: "active",
      refreshToken: { not: null },
      OR: [
        { tokenExpiresAt: { lte: refreshBefore } },
        { tokenExpiresAt: null },
      ],
    },
  });

  for (const channel of channels) {
    try {
      await refreshAccessToken(channel.id);
      console.log(`[Scheduler] Proactively refreshed token for channel: ${channel.name}`);
    } catch (err: any) {
      console.warn(
        `[Scheduler] Failed to refresh token for channel ${channel.name}:`,
        err.message
      );
      // If refresh fails (e.g. refresh token revoked), mark channel as error
      if (err.message.includes("invalid_grant") || err.message.includes("refresh token")) {
        await db.channel.update({
          where: { id: channel.id },
          data: { status: "error" },
        }).catch(() => {});
        await db.activityLog.create({
          data: {
            userId: channel.userId,
            level: "error",
            category: "channel",
            message: `Channel ${channel.name} token refresh failed — re-authorization required`,
            details: err.message,
          },
        }).catch(() => {});
      }
    }
  }
}

// Internal: start a stream (FFmpeg + optional YouTube broadcast)
async function startStreamInternal(stream: any) {
  // === ATOMIC LOCK: claim the stream by atomically transitioning its
  // status to "preparing". The `where` clause filters on status NOT
  // being in {live, preparing, stopping}, so:
  //   - If the user already started it manually (status=preparing/live),
  //     this returns count=0 and we bail.
  //   - If another scheduler tick is racing us, only one wins.
  // This mirrors the pattern in /api/streams/[id]/start and prevents
  // the double-FFmpeg-spawn race that the previous non-atomic guard had.
  const claim = await db.stream.updateMany({
    where: {
      id: stream.id,
      status: { notIn: ["live", "preparing", "stopping"] },
    },
    data: { status: "preparing", lastError: null },
  });
  if (claim.count === 0) {
    console.log(`[Scheduler] Stream ${stream.id} already live/preparing/stopping, skipping`);
    return;
  }

  // Re-fetch the claimed stream for the latest data (title, thumbnail, etc.)
  // CRITICAL: include the channel relation — fresh.channel?.status is
  // checked below to decide whether to create a YouTube broadcast.
  // Without `include: { channel: true }`, fresh.channel is undefined and
  // the broadcast creation block is silently skipped for every auto-start.
  const fresh = await db.stream.findUnique({
    where: { id: stream.id },
    include: { channel: true },
  });
  if (!fresh) {
    console.log(`[Scheduler] Stream ${stream.id} disappeared after claim, aborting`);
    return;
  }

  // Resolve video files (combines individual files + playlist expansion).
  // Pass userId so resolveVideoFiles filters out any cross-user file/playlist IDs.
  const resolved = await resolveVideoFiles({
    sourceType: fresh.sourceType,
    sourcePath: fresh.sourcePath,
    sourceFileIds: fresh.sourceFileIds,
    playlistSourceIds: fresh.playlistSourceIds,
    userId: fresh.userId,
  });
  const videoFiles = resolved.videoFiles;

  if (videoFiles.length === 0) {
    throw new Error("No video files found");
  }

  // === VIDEO SHUFFLE ===
  // If the stream (or any selected playlist with shuffleOwn=true) has
  // shuffle enabled, randomize the playback order.
  if (shouldShuffleQueue(stream.shuffle, resolved) && videoFiles.length > 1) {
    shuffleArray(videoFiles);
    console.log(
      `[Scheduler] Shuffled ${videoFiles.length} video files ` +
      `(${resolved.individualCount} individual + ${resolved.playlistCount} from ${resolved.playlistExpandedCount} playlist(s))`
    );
  }

  // Status is already "preparing" (set by the atomic claim above).
  // No need for a separate update here.

  // Create YouTube broadcast if channel is connected.
  // Use `fresh` (re-fetched after the atomic claim) for all field access
  // so we have the latest data — the original `stream` arg may be stale.
  if (fresh.channelId && fresh.channel?.status === "active") {
    try {
      const startAt = fresh.startAt || new Date();
      const minSec = fresh.minHours * 3600;
      const maxSec = fresh.maxHours * 3600;
      const randomSec = minSec + Math.random() * (maxSec - minSec);
      const endAt = new Date(startAt.getTime() + randomSec * 1000);

      let replayPrivacy = fresh.privacyStatus;
      if (replayPrivacy === "random_unlisted") {
        replayPrivacy = Math.random() < 0.5 ? "unlisted" : "public";
      }

      // === USE PRE-PICKED TITLE (resolved at schedule creation time) ===
      const broadcastTitle = fresh.resolvedTitle || fresh.name;
      if (fresh.resolvedTitle) {
        console.log(`[Scheduler] Using pre-picked title: "${broadcastTitle}"`);
      } else {
        console.log(`[Scheduler] No pre-picked title, using stream.name: "${broadcastTitle}"`);
      }

      const { broadcastId, streamId: ytStreamId, created } = await createOrUpdateBroadcast(
        fresh.channelId,
        fresh.broadcastId,
        {
          title: broadcastTitle,
          description: fresh.description || "",
          startAt,
          endAt,
          privacyStatus: "public",
          categoryId: fresh.categoryId,
          tags: fresh.tags ? fresh.tags.split(",").map((t) => t.trim()) : undefined,
        }
      );

      // === UPLOAD PRE-PICKED THUMBNAIL (resolved at schedule creation time) ===
      if (fresh.resolvedThumbnailPath) {
        try {
          const thumbUrl = await uploadThumbnail(
            fresh.channelId,
            broadcastId,
            fresh.resolvedThumbnailPath,
            fresh.resolvedThumbnailMime || "image/jpeg"
          );
          if (thumbUrl) {
            console.log(`[Scheduler] Thumbnail uploaded: ${thumbUrl}`);
            await db.stream.update({
              where: { id: fresh.id },
              data: { thumbnailUrl: thumbUrl },
            });
          }
        } catch (err: any) {
          console.warn("[Scheduler] Thumbnail upload failed:", err.message);
        }
      }

      await db.stream.update({
        where: { id: fresh.id },
        data: {
          broadcastId,
          ...(created ? { streamId: ytStreamId } : {}),
          broadcastStatus: created ? "created" : "updated",
          privacyStatus: replayPrivacy,
        },
      });
      console.log(`[Scheduler] Broadcast ${created ? "created" : "updated"}: ${broadcastId}`);
    } catch (err: any) {
      console.warn("[Scheduler] Failed to create broadcast:", err.message);
    }
  }

  // Start FFmpeg — use fresh fields for all settings.
  // Clamp durationSeconds to at least 60s to prevent flapping when
  // minHours=0 and Math.random() returns a tiny value (which would
  // produce randomDurationSec=0 or 1, causing FFmpeg to exit immediately
  // and trigger the auto-retry loop).
  const minSec = fresh.minHours * 3600;
  const maxSec = fresh.maxHours * 3600;
  const rawDuration = Math.round(minSec + Math.random() * (maxSec - minSec));
  const randomDurationSec = Math.max(60, rawDuration);

  let pid: number;
  let logFile: string;
  try {
    const result = await startFFmpegStream({
      streamKey: fresh.streamKey,
      rtmpUrl: fresh.rtmpUrl,
      videoFiles,
      encoder: fresh.encoder,
      copyMode: fresh.copyMode,
      videoBitrate: fresh.videoBitrate,
      audioBitrate: fresh.audioBitrate,
      resolution: fresh.resolution,
      fps: fresh.fps,
      preset: fresh.preset,
      durationSeconds: randomDurationSec,
      logFile: undefined,
    });
    pid = result.pid;
    logFile = result.logFile;
  } catch (ffmpegErr: any) {
    // FFmpeg spawn failed — roll back to "scheduled" so the user can
    // see the error and retry. Don't leave it stuck in "preparing".
    await db.stream.update({
      where: { id: fresh.id },
      data: { status: "error", lastError: `FFmpeg spawn failed: ${ffmpegErr.message}` },
    }).catch(() => {});
    throw ffmpegErr;
  }

  await db.stream.update({
    where: { id: fresh.id },
    data: {
      status: "live",
      pid,
      logFile,
      startedAt: new Date(),
      endedAt: null,
      lastError: null,
      retryCount: 0, // Reset retry count on successful start
    },
  });

  await db.activityLog.create({
    data: {
      userId: fresh.userId,
      level: "success",
      category: "stream",
      message: `Stream auto-started: ${fresh.name}`,
      details: `PID: ${pid}`,
    },
  });
}

// Internal: stop a stream (FFmpeg + YouTube transition)
async function stopStreamInternal(stream: any) {
  // === ATOMIC LOCK: claim the stream for stopping. Same pattern as the
  // manual stop route — prevents double YouTube transition (quota burn)
  // when the scheduler's autoStopExpiredStreams and a manual stop request
  // race for the same stream.
  const claim = await db.stream.updateMany({
    where: {
      id: stream.id,
      status: { in: ["live", "preparing"] },
    },
    data: { status: "stopping" },
  });
  if (claim.count === 0) {
    console.log(`[Scheduler] Stream ${stream.id} not live/preparing, skipping stop`);
    return;
  }
  const fresh = await db.stream.findUnique({ where: { id: stream.id } });
  if (!fresh) {
    console.log(`[Scheduler] Stream ${stream.id} disappeared after stop claim, aborting`);
    return;
  }

  const { stopFFmpegStream } = await import("@/lib/ffmpeg");
  const { transitionBroadcast } = await import("@/lib/youtube");

  // 1. Stop FFmpeg first (stop pushing video to YouTube).
  // Use fresh.pid in case it changed between the claim and now.
  if (fresh.pid) {
    await stopFFmpegStream(fresh.pid);
  }

  // 2. Transition YouTube broadcast to "complete" WITH RETRY
  // YouTube needs time to process the transition. The retry logic in
  // transitionBroadcast() will wait and retry up to 5 times (5s, 10s, 20s, 40s, 80s).
  // This is critical because if the broadcast stays "live" in YouTube,
  // the next-day schedule's createOrUpdateBroadcast will fail.
  if (stream.channelId && stream.broadcastId) {
    try {
      await transitionBroadcast(stream.channelId, stream.broadcastId, "complete");
      console.log(`[Scheduler] YouTube broadcast ${stream.broadcastId} completed successfully`);
    } catch (err: any) {
      console.warn(`[Scheduler] YouTube broadcast transition failed after retries: ${err.message}`);
      // Log to activity so user knows YouTube may still show "live"
      await db.activityLog.create({
        data: {
          userId: stream.userId,
          level: "warn",
          category: "stream",
          message: `YouTube broadcast may still be processing: ${stream.name}`,
          details: `Transition to "complete" failed: ${err.message}. YouTube Studio may need manual check.`,
        },
      }).catch(() => {});
    }
  }

  // 3. Mark stream as ended in database
  await db.stream.update({
    where: { id: stream.id },
    data: {
      status: "ended",
      endedAt: new Date(),
      pid: null,
    },
  });

  await db.activityLog.create({
    data: {
      userId: stream.userId,
      level: "info",
      category: "stream",
      message: `Stream auto-stopped: ${stream.name}`,
    },
  });

  // 4. Create next-day schedule (even if YouTube transition failed —
  // the stream key is the same, so FFmpeg will push to YouTube regardless)
  if (stream.autoCreateSchedule) {
    await createNextDaySchedule(stream);
  }
}

// Create a new stream for startAt + 24h with the same stream key & config
export async function createNextDaySchedule(stream: any) {
  // Compute next startAt = original startAt + 24 hours
  // (NOT endedAt + 24h — user explicitly wants startAt + 24h)
  const baseStartAt = stream.startAt || stream.startedAt || new Date();
  const nextStartAt = new Date(baseStartAt.getTime() + 24 * 60 * 60 * 1000);

  // === GUARD: prevent infinite schedule creation loop ===
  // If nextStartAt is still in the past (e.g. original startAt was days ago),
  // creating a next-day schedule would immediately trigger another auto-start
  // which would error and create ANOTHER next-day schedule — infinite loop.
  // Instead, skip creation and log a warning. The user should manually
  // create a new schedule with a future startAt.
  if (nextStartAt.getTime() <= Date.now()) {
    console.warn(
      `[Scheduler] Skipping next-day schedule for stream ${stream.id}: ` +
      `nextStartAt (${nextStartAt.toISOString()}) is in the past. ` +
      `Original startAt was too far in the past — manual reschedule required.`
    );
    await db.activityLog.create({
      data: {
        userId: stream.userId,
        level: "warn",
        category: "stream",
        message: `Auto-schedule skipped for "${stream.name}": startAt was too far in the past`,
        details: `Original startAt: ${baseStartAt.toISOString()}. Create a new schedule manually with a future date.`,
      },
    }).catch(() => {});
    return null;
  }

  try {
    const newStream = await db.stream.create({
      data: {
        userId: stream.userId,
        channelId: stream.channelId,
        name: stream.name,
        description: stream.description,
        streamKey: stream.streamKey, // SAME stream key
        rtmpUrl: stream.rtmpUrl,
        sourceType: stream.sourceType,
        sourcePath: stream.sourcePath,
        sourceFileIds: stream.sourceFileIds,
        playlistSourceIds: stream.playlistSourceIds,
        shuffle: stream.shuffle,
        loopUntilDuration: stream.loopUntilDuration,
        minHours: stream.minHours,
        maxHours: stream.maxHours,
        startAt: nextStartAt,
        autoCreateSchedule: stream.autoCreateSchedule,
        shuffleTitle: stream.shuffleTitle,
        shuffleThumbnail: stream.shuffleThumbnail,
        encoder: stream.encoder,
        copyMode: stream.copyMode,
        videoBitrate: stream.videoBitrate,
        audioBitrate: stream.audioBitrate,
        resolution: stream.resolution,
        fps: stream.fps,
        preset: stream.preset,
        privacyStatus: stream.privacyStatus,
        categoryId: stream.categoryId,
        tags: stream.tags,
        playlistId: stream.playlistId,
        alteredContent: stream.alteredContent,
        spinnerMode: stream.spinnerMode,
        spinnerEmojis: stream.spinnerEmojis,
        status: "scheduled",
        // NOTE: resolvedTitle/resolvedThumbnailPath are NOT copied — the new
        // schedule picks its OWN fresh title/thumbnail below.
      },
    });

    // === PICK FRESH TITLE & THUMBNAIL FOR THE NEW SCHEDULE ===
    // (at schedule creation time, NOT at stream start)
    if (newStream.channelId) {
      try {
        const effectiveSpinnerMode = newStream.spinnerMode || "off";
        const effectiveSpinnerEmojis = newStream.spinnerEmojis
          ? JSON.parse(newStream.spinnerEmojis)
          : [];
        const picked = await pickTitleAndThumbnail(
          newStream.channelId,
          effectiveSpinnerMode,
          effectiveSpinnerEmojis,
          newStream.shuffleTitle || false,
          newStream.shuffleThumbnail || false
        );
        await db.stream.update({
          where: { id: newStream.id },
          data: {
            resolvedTitle: picked.resolvedTitle,
            resolvedThumbnailPath: picked.resolvedThumbnailPath,
            resolvedThumbnailMime: picked.resolvedThumbnailMime,
          },
        });
        if (picked.resolvedTitle) {
          console.log(`[Scheduler] Picked title for next-day stream ${newStream.id}: "${picked.resolvedTitle}"`);
        }
      } catch (err: any) {
        console.warn("[Scheduler] Failed to pick title/thumbnail for next-day:", err.message);
      }
    }

    await db.activityLog.create({
      data: {
        userId: stream.userId,
        level: "info",
        category: "stream",
        message: `Auto-created next-day schedule: ${stream.name}`,
        details: `Start at ${nextStartAt.toISOString()}`,
      },
    });

    return newStream;
  } catch (err: any) {
    console.error("[Scheduler] Failed to create next-day schedule:", err.message);
    return null;
  }
}

// Start the scheduler using node-cron for persistence.
// node-cron survives server restarts better than setInterval because
// it re-syncs to the clock (not relative time), and the schedule
// definition is idempotent (safe to call multiple times).
import cron from "node-cron";

let cronJob: cron.ScheduledTask | null = null;

export function startScheduler() {
  if (cronJob) return; // already running

  console.log("[Scheduler] Starting persistent scheduler (node-cron, every 30s)");

  // Use node-cron for persistent scheduling (survives event loop delays).
  // Run every 30 seconds: */30 * * * * *
  // NOTE: previously this also started a setInterval on the same 30s
  // cadence as a "fallback" — but both ran unconditionally, doubling
  // the scheduling overhead and log noise. node-cron alone is
  // sufficient; the `isRunning` guard in schedulerTick prevents overlap
  // even if a tick is somehow delayed.
  cronJob = cron.schedule("*/30 * * * * *", () => {
    schedulerTick().catch((err) =>
      console.error("[Scheduler] Cron tick error:", err)
    );
  });

  // Also run once immediately on start so newly-started streams don't
  // have to wait up to 30s for the first cron tick.
  schedulerTick().catch(console.error);
}

// Stop the scheduler
export function stopScheduler() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
  console.log("[Scheduler] Stopped");
}

// Returns true if the scheduler is currently running (cronJob is set).
// Used by the GET /api/scheduler endpoint to report actual state.
export function isSchedulerRunning(): boolean {
  return cronJob !== null;
}
