// POST /api/streams/[id]/start — Start a stream (FFmpeg process)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { startFFmpegStream, isProcessRunning } from "@/lib/ffmpeg";
import { createBroadcast, getNextTitle, getNextThumbnail, uploadThumbnail } from "@/lib/youtube";

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

    // Resolve video files
    let videoFiles: string[] = [];
    if (stream.sourceType === "local" && stream.sourcePath) {
      const fs = await import("fs/promises");
      const path = await import("path");
      try {
        const entries = await fs.readdir(stream.sourcePath);
        const VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".ts", ".flv"];
        videoFiles = entries
          .filter((f) => VIDEO_EXTS.some((ext) => f.toLowerCase().endsWith(ext)))
          .map((f) => path.join(stream.sourcePath!, f));
      } catch {
        return NextResponse.json(
          { error: `Cannot read source folder: ${stream.sourcePath}` },
          { status: 400 }
        );
      }
    } else if (stream.sourceFileIds) {
      // Resolve uploaded files from the database
      const fileIds: string[] = JSON.parse(stream.sourceFileIds);
      const files = await db.uploadedFile.findMany({
        where: { id: { in: fileIds } },
      });
      videoFiles = files
        .filter((f) => f.storagePath)
        .map((f) => f.storagePath!);
    }

    if (videoFiles.length === 0) {
      return NextResponse.json(
        { error: "No video files found. Please add source files to the stream." },
        { status: 400 }
      );
    }

    // === VIDEO SHUFFLE ===
    // If the stream has shuffle enabled, randomize the playback order.
    if (stream.shuffle && videoFiles.length > 1) {
      for (let i = videoFiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [videoFiles[i], videoFiles[j]] = [videoFiles[j], videoFiles[i]];
      }
      console.log(`[Start] Shuffled ${videoFiles.length} video files`);
    }

    // Update status to preparing
    await db.stream.update({
      where: { id: stream.id },
      data: { status: "preparing", lastError: null },
    });

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

        // === TITLE ROTATOR ===
        // Try to get the next title from the channel's title list.
        // Applies spinner emoji (front/back/both) if enabled.
        // Falls back to stream.name if no titles configured.
        let broadcastTitle = stream.name;
        try {
          const spinnerEmojis = stream.spinnerEmojis
            ? JSON.parse(stream.spinnerEmojis)
            : [];
          const rotatedTitle = await getNextTitle(
            stream.channelId,
            stream.spinnerMode || "off",
            spinnerEmojis
          );
          if (rotatedTitle) {
            broadcastTitle = rotatedTitle;
            console.log(`[Start] Using rotated title: "${broadcastTitle}"`);
          }
        } catch (err: any) {
          console.warn("[Start] Title rotator failed, using stream.name:", err.message);
        }

        // === THUMBNAIL ROTATOR ===
        let nextThumb: { id: string; storagePath: string; mimeType: string } | null = null;
        try {
          nextThumb = await getNextThumbnail(stream.channelId);
        } catch (err: any) {
          console.warn("[Start] Thumbnail rotator failed:", err.message);
        }

        const { broadcastId, streamId: ytStreamId } = await createBroadcast(
          stream.channelId,
          {
            title: broadcastTitle, // ← rotated title (not stream.name)
            description: stream.description || "",
            startAt,
            endAt,
            // Live broadcast is always public; replay privacy applied at transition
            privacyStatus: "public",
            categoryId: stream.categoryId,
            tags: stream.tags ? stream.tags.split(",").map((t) => t.trim()) : undefined,
          }
        );

        // === UPLOAD THUMBNAIL ===
        if (nextThumb) {
          try {
            const thumbUrl = await uploadThumbnail(
              stream.channelId,
              broadcastId,
              nextThumb.storagePath,
              nextThumb.mimeType
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
            streamId: ytStreamId,
            broadcastStatus: "created",
            // Persist the resolved replay privacy for the stop handler
            privacyStatus: replayPrivacy,
          },
        });
      } catch (err: any) {
        console.warn("Failed to create broadcast:", err.message);
        // Continue without broadcast — the stream key will still work
      }
    }

    // Start FFmpeg — uses the YouTube stream key (NOT the API)
    // Randomize the stream duration between minHours and maxHours
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
      logFile: undefined, // Let FFmpeg manager create one
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
        userId: user.id,
        level: "success",
        category: "stream",
        message: `Stream started: ${stream.name}`,
        details: `PID: ${pid}`,
      },
    });

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
