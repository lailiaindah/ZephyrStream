// Stream scheduler — background job that auto-starts streams when their
// scheduled startAt time arrives, and auto-creates next-day schedules when
// a stream with autoCreateSchedule ends or errors.
//
// This runs as an in-memory interval. For production, consider a more
// robust queue (BullMQ / cron) — but for a single-VPS deployment this
// is sufficient and simple.

import { db } from "@/lib/db";
import { startFFmpegStream, isProcessRunning } from "@/lib/ffmpeg";
import { createBroadcast, uploadThumbnail, pickTitleAndThumbnail, refreshAccessToken } from "@/lib/youtube";
import { runCleanupIfNeeded } from "@/lib/cleanup";

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

// 3. Cleanup "ghost" live streams — status is live but FFmpeg process is dead
async function cleanupGhostStreams() {
  const live = await db.stream.findMany({
    where: { status: "live", pid: { not: null } },
  });

  for (const stream of live) {
    if (stream.pid && !isProcessRunning(stream.pid)) {
      console.log(`[Scheduler] Ghost stream detected: ${stream.id} (PID ${stream.pid} dead)`);

      // Mark as ended (or error if it didn't run long enough)
      await db.stream.update({
        where: { id: stream.id },
        data: {
          status: "ended",
          endedAt: new Date(),
          pid: null,
          lastError: "FFmpeg process died unexpectedly",
        },
      });

      // If autoCreateSchedule is on, create the next-day schedule
      if (stream.autoCreateSchedule) {
        await createNextDaySchedule(stream);
      }
    }
  }
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
  // === GUARD: prevent double-start race condition ===
  // Re-fetch the stream to check its current status. If another scheduler
  // tick or a manual Start already moved it to "preparing"/"live", abort.
  const fresh = await db.stream.findUnique({ where: { id: stream.id } });
  if (!fresh || fresh.status === "live" || fresh.status === "preparing") {
    console.log(`[Scheduler] Stream ${stream.id} already ${fresh?.status || "missing"}, skipping`);
    return;
  }

  // Resolve video files
  let videoFiles: string[] = [];

  if (stream.sourceType === "local" && stream.sourcePath) {
    const fs = await import("fs/promises");
    const path = await import("path");
    const entries = await fs.readdir(stream.sourcePath);
    const VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".ts", ".flv"];
    videoFiles = entries
      .filter((f) => VIDEO_EXTS.some((ext) => f.toLowerCase().endsWith(ext)))
      .map((f) => path.join(stream.sourcePath!, f));
  } else if (stream.sourceFileIds) {
    const fileIds: string[] = JSON.parse(stream.sourceFileIds);
    const files = await db.uploadedFile.findMany({
      where: { id: { in: fileIds } },
    });
    videoFiles = files.filter((f) => f.storagePath).map((f) => f.storagePath!);
  }

  if (videoFiles.length === 0) {
    throw new Error("No video files found");
  }

  // === VIDEO SHUFFLE ===
  // If the stream has shuffle enabled, randomize the playback order.
  if (stream.shuffle && videoFiles.length > 1) {
    for (let i = videoFiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [videoFiles[i], videoFiles[j]] = [videoFiles[j], videoFiles[i]];
    }
    console.log(`[Scheduler] Shuffled ${videoFiles.length} video files`);
  }

  await db.stream.update({
    where: { id: stream.id },
    data: { status: "preparing", lastError: null },
  });

  // Create YouTube broadcast if channel is connected
  if (stream.channelId && stream.channel?.status === "active") {
    try {
      const startAt = stream.startAt || new Date();
      const minSec = stream.minHours * 3600;
      const maxSec = stream.maxHours * 3600;
      const randomSec = minSec + Math.random() * (maxSec - minSec);
      const endAt = new Date(startAt.getTime() + randomSec * 1000);

      let replayPrivacy = stream.privacyStatus;
      if (replayPrivacy === "random_unlisted") {
        replayPrivacy = Math.random() < 0.5 ? "unlisted" : "public";
      }

      // === USE PRE-PICKED TITLE (resolved at schedule creation time) ===
      // The title was picked when the stream was created/rescheduled.
      // Fall back to stream.name only if no title was picked (e.g. channel
      // had no titles at creation time).
      const broadcastTitle = stream.resolvedTitle || stream.name;
      if (stream.resolvedTitle) {
        console.log(`[Scheduler] Using pre-picked title: "${broadcastTitle}"`);
      } else {
        console.log(`[Scheduler] No pre-picked title, using stream.name: "${broadcastTitle}"`);
      }

      const { broadcastId, streamId: ytStreamId } = await createBroadcast(
        stream.channelId,
        {
          title: broadcastTitle,
          description: stream.description || "",
          startAt,
          endAt,
          privacyStatus: "public",
          categoryId: stream.categoryId,
          tags: stream.tags ? stream.tags.split(",").map((t) => t.trim()) : undefined,
        }
      );

      // === UPLOAD PRE-PICKED THUMBNAIL (resolved at schedule creation time) ===
      if (stream.resolvedThumbnailPath) {
        try {
          const thumbUrl = await uploadThumbnail(
            stream.channelId,
            broadcastId,
            stream.resolvedThumbnailPath,
            stream.resolvedThumbnailMime || "image/jpeg"
          );
          if (thumbUrl) {
            console.log(`[Scheduler] Thumbnail uploaded: ${thumbUrl}`);
            await db.stream.update({
              where: { id: stream.id },
              data: { thumbnailUrl: thumbUrl },
            });
          }
        } catch (err: any) {
          console.warn("[Scheduler] Thumbnail upload failed:", err.message);
        }
      }

      await db.stream.update({
        where: { id: stream.id },
        data: {
          broadcastId,
          streamId: ytStreamId,
          broadcastStatus: "created",
          privacyStatus: replayPrivacy,
        },
      });
    } catch (err: any) {
      console.warn("[Scheduler] Failed to create broadcast:", err.message);
    }
  }

  // Start FFmpeg
  const minSec = stream.minHours * 3600;
  const maxSec = stream.maxHours * 3600;
  const randomDurationSec = Math.round(minSec + Math.random() * (maxSec - minSec));

  const { pid, logFile } = await startFFmpegStream({
    streamKey: stream.streamKey,
    rtmpUrl: stream.rtmpUrl,
    videoFiles,
    encoder: stream.encoder,
    copyMode: stream.copyMode,
    videoBitrate: stream.videoBitrate,
    audioBitrate: stream.audioBitrate,
    resolution: stream.resolution,
    fps: stream.fps,
    preset: stream.preset,
    durationSeconds: randomDurationSec,
    logFile: undefined,
  });

  await db.stream.update({
    where: { id: stream.id },
    data: {
      status: "live",
      pid,
      logFile,
      startedAt: new Date(),
      endedAt: null,
      lastError: null,
    },
  });

  await db.activityLog.create({
    data: {
      userId: stream.userId,
      level: "success",
      category: "stream",
      message: `Stream auto-started: ${stream.name}`,
      details: `PID: ${pid}`,
    },
  });
}

// Internal: stop a stream (FFmpeg + YouTube transition)
async function stopStreamInternal(stream: any) {
  // === GUARD: prevent double-stop race condition ===
  // Re-fetch to check status. If already ended/error, skip (another tick
  // may have already stopped it, or the ghost cleanup ran first).
  const fresh = await db.stream.findUnique({ where: { id: stream.id } });
  if (!fresh || fresh.status === "ended" || fresh.status === "error") {
    console.log(`[Scheduler] Stream ${stream.id} already ${fresh?.status || "missing"}, skip stop`);
    return;
  }

  const { stopFFmpegStream } = await import("@/lib/ffmpeg");
  const { transitionBroadcast } = await import("@/lib/youtube");

  if (stream.pid) {
    await stopFFmpegStream(stream.pid);
  }

  if (stream.channelId && stream.broadcastId) {
    try {
      await transitionBroadcast(stream.channelId, stream.broadcastId, "complete");
    } catch (err: any) {
      console.warn("[Scheduler] Failed to transition broadcast:", err.message);
    }
  }

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

  // If autoCreateSchedule is on, create the next-day schedule
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
        shuffle: stream.shuffle,
        minHours: stream.minHours,
        maxHours: stream.maxHours,
        startAt: nextStartAt,
        autoCreateSchedule: stream.autoCreateSchedule,
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
          effectiveSpinnerEmojis
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

// Start the scheduler (call once on server boot)
export function startScheduler() {
  if (schedulerInterval) return;
  console.log("[Scheduler] Starting stream scheduler (30s interval)");
  schedulerInterval = setInterval(schedulerTick, CHECK_INTERVAL_MS);
  // Run once immediately on start
  schedulerTick().catch(console.error);
}

// Stop the scheduler
export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Scheduler] Stopped");
  }
}
