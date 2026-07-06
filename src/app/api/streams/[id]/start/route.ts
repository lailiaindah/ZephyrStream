// POST /api/streams/[id]/start — Start a stream (FFmpeg process)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { startFFmpegStream, isProcessRunning } from "@/lib/ffmpeg";
import { createOrUpdateBroadcast, uploadThumbnail } from "@/lib/youtube";
import { resolveVideoFiles, shouldShuffleQueue, shuffleArray } from "@/lib/video-source";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const stream = await db.stream.findFirst({
      where: { id, userId: user.id },
      include: { channel: true },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    if (stream.status === "live" || stream.status === "preparing") {
      return NextResponse.json(
        { error: "Stream is already running" },
        { status: 400 }
      );
    }

    // Check if process is already running
    if (stream.pid && isProcessRunning(stream.pid)) {
      return NextResponse.json(
        { error: "A process is already running for this stream" },
        { status: 400 }
      );
    }

    // === ATOMIC LOCK: claim the stream by atomically transitioning its
    // status to "preparing". If two concurrent start requests arrive,
    // only one will see `count === 1` — the other gets `count === 0`
    // and bails out. This prevents double-FFmpeg spawns.
    // The `where` clause filters on the current status NOT being in
    // {live, preparing, stopping}, so an already-running stream is
    // rejected atomically.
    const claim = await db.stream.updateMany({
      where: {
        id,
        status: { notIn: ["live", "preparing", "stopping"] },
      },
      data: { status: "preparing", lastError: null },
    });
    if (claim.count === 0) {
      return NextResponse.json(
        { error: "Stream is already running or being started by another request" },
        { status: 409 }
      );
    }

    // Resolve video files (combines individual files + playlist expansion).
    // Pass userId so resolveVideoFiles can filter out any file/playlist IDs
    // that don't belong to this user (defense in depth — the PATCH endpoint
    // also validates ownership, but this prevents an attacker who somehow
    // got sourceFileIds set to another user's IDs from streaming them).
    const resolved = await resolveVideoFiles({
      sourceType: stream.sourceType,
      sourcePath: stream.sourcePath,
      sourceFileIds: stream.sourceFileIds,
      playlistSourceIds: stream.playlistSourceIds,
      userId: stream.userId,
    });
    const videoFiles = resolved.videoFiles;

    if (videoFiles.length === 0) {
      // Roll back the preparing claim so the user can retry
      await db.stream.update({
        where: { id },
        data: { status: "scheduled" },
      }).catch(() => {});
      return NextResponse.json(
        { error: "No video files found. Please add source files or playlists to the stream." },
        { status: 400 }
      );
    }

    // === VIDEO SHUFFLE ===
    // If the stream (or any selected playlist with shuffleOwn=true) has
    // shuffle enabled, randomize the playback order. Each restart will
    // produce a different order, so playlist contents are reshuffled
    // every stream.
    if (shouldShuffleQueue(stream.shuffle, resolved) && videoFiles.length > 1) {
      shuffleArray(videoFiles);
      console.log(
        `[Start] Shuffled ${videoFiles.length} video files ` +
        `(${resolved.individualCount} individual + ${resolved.playlistCount} from ${resolved.playlistExpandedCount} playlist(s))`
      );
    } else {
      console.log(
        `[Start] Resolved ${videoFiles.length} video files ` +
        `(${resolved.individualCount} individual + ${resolved.playlistCount} from ${resolved.playlistExpandedCount} playlist(s)) — no shuffle`
      );
    }

    // If channel is connected, create a YouTube broadcast (uses API quota)
    if (stream.channelId && stream.channel?.status === "active") {
      try {
        const startAt = stream.startAt || new Date();
        // Randomize duration between minHours and maxHours
        const minSec = stream.minHours * 3600;
        const maxSec = stream.maxHours * 3600;
        const randomSec = minSec + Math.random() * (maxSec - minSec);
        const endAt = new Date(startAt.getTime() + randomSec * 1000);

        // Resolve privacy: live broadcast is always public; the stored
        // privacyStatus controls the REPLAY visibility (post-live).
        // random_unlisted randomly picks unlisted for the replay.
        let replayPrivacy = stream.privacyStatus;
        if (replayPrivacy === "random_unlisted") {
          replayPrivacy = Math.random() < 0.5 ? "unlisted" : "public";
        }

        // === USE PRE-PICKED TITLE (resolved at schedule creation time) ===
        // The title was picked when the stream was created/rescheduled.
        // Fall back to stream.name only if no title was picked.
        const broadcastTitle = stream.resolvedTitle || stream.name;
        if (stream.resolvedTitle) {
          console.log(`[Start] Using pre-picked title: "${broadcastTitle}"`);
        } else {
          console.log(`[Start] No pre-picked title, using stream.name: "${broadcastTitle}"`);
        }

        const { broadcastId, streamId: ytStreamId, created } = await createOrUpdateBroadcast(
          stream.channelId,
          stream.broadcastId, // pass existing broadcastId for update
          {
            title: broadcastTitle,
            description: stream.description || "",
            startAt,
            endAt,
            // Live broadcast is always public; replay privacy applied at transition
            privacyStatus: "public",
            categoryId: stream.categoryId,
            tags: stream.tags ? stream.tags.split(",").map((t) => t.trim()) : undefined,
          }
        );
        // Only update streamId if a new broadcast was created
        // (existing broadcast already has stream binding)

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
              console.log(`[Start] Thumbnail uploaded: ${thumbUrl}`);
              await db.stream.update({
                where: { id: stream.id },
                data: { thumbnailUrl: thumbUrl },
              });
            }
          } catch (err: any) {
            console.warn("[Start] Thumbnail upload failed:", err.message);
          }
        }

        await db.stream.update({
          where: { id: stream.id },
          data: {
            broadcastId,
            // Only update streamId if a new broadcast was created
            // (existing broadcast already has stream binding from first creation)
            ...(created ? { streamId: ytStreamId } : {}),
            broadcastStatus: created ? "created" : "updated",
            // Persist the resolved replay privacy for the stop handler
            privacyStatus: replayPrivacy,
          },
        });
        console.log(`[Start] Broadcast ${created ? "created" : "updated"}: ${broadcastId}`);
      } catch (err: any) {
        console.warn("Failed to create broadcast:", err.message);
        // Continue without broadcast — the stream key will still work
      }
    }

    // Start FFmpeg — uses the YouTube stream key (NOT the API).
    // Randomize the stream duration between minHours and maxHours.
    // Clamp to at least 60s to prevent flapping when minHours is very small.
    const minSec = stream.minHours * 3600;
    const maxSec = stream.maxHours * 3600;
    const rawDuration = Math.round(minSec + Math.random() * (maxSec - minSec));
    const randomDurationSec = Math.max(60, rawDuration);

    // Track the spawned PID so the catch block can clean it up if the
    // subsequent DB update fails. Without this, a DB error after a
    // successful FFmpeg spawn would leave an untracked FFmpeg process
    // pushing to YouTube with no way for the user to stop it.
    let spawnedPid: number | null = null;
    let spawnedLogFile: string | null = null;
    let pid: number;
    let logFile: string;
    try {
      const result = await startFFmpegStream({
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
        logFile: undefined, // Let FFmpeg manager create one
      });
      pid = result.pid;
      logFile = result.logFile;
      spawnedPid = pid;
      spawnedLogFile = logFile;
    } catch (ffmpegErr: any) {
      // FFmpeg spawn itself failed — no process to clean up.
      throw ffmpegErr;
    }

    try {
      await db.stream.update({
        where: { id: stream.id },
        data: {
          status: "live",
          pid,
          logFile,
          startedAt: new Date(),
          endedAt: null,
          lastError: null,
          retryCount: 0, // Reset retry count on manual start
        },
      });
    } catch (dbErr: any) {
      // DB update failed AFTER FFmpeg was already spawned. Kill the
      // orphaned process so it doesn't keep pushing to YouTube with no
      // DB tracking. The user can't stop it via the UI (status is
      // stuck in "preparing"), so we have to clean up here.
      if (spawnedPid) {
        try {
          const { stopFFmpegStream } = await import("@/lib/ffmpeg");
          await stopFFmpegStream(spawnedPid);
        } catch {}
      }
      throw dbErr;
    }

    // Activity log is non-critical — wrap in its own try/catch so a
    // failure (e.g., SQLite busy) doesn't propagate to the outer catch
    // and mark the stream as "error" even though FFmpeg is actively
    // streaming to YouTube.
    // Set quotaCost explicitly: broadcast insert (50) + liveStream insert (50)
    // + bind (50) = 150 if created, or update (50) if updated.
    try {
      await db.activityLog.create({
        data: {
          userId: user.id,
          level: "success",
          category: "stream",
          message: `Stream started: ${stream.name}`,
          details: `PID: ${pid}`,
          quotaCost: stream.channelId && stream.channel?.status === "active" ? 150 : 0,
        },
      });
    } catch (logErr) {
      console.warn("[Start] Failed to create activity log (non-fatal):", logErr);
    }

    return NextResponse.json({
      success: true,
      pid,
      logFile,
    });
  } catch (error: any) {
    // Mark stream as errored
    try {
      const { id } = await params;
      await db.stream.update({
        where: { id },
        data: { status: "error", lastError: error.message },
      });
    } catch {}

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
