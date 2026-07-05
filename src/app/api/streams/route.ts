// GET /api/streams — List user's streams (optionally filtered by channelId)
// POST /api/streams — Create a new stream
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { YOUTUBE_RTMP_BASE } from "@/lib/constants";
import { pickTitleAndThumbnail } from "@/lib/youtube";
import { validateSourcePath } from "@/lib/path-validation";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");

    // Verify channel ownership if channelId provided
    if (channelId) {
      const channel = await db.channel.findFirst({
        where: { id: channelId, userId: user.id },
      });
      if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const streams = await db.stream.findMany({
      where: {
        userId: user.id,
        ...(channelId ? { channelId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        channel: {
          select: { id: true, name: true, youtubeChannelName: true },
        },
      },
    });

    return NextResponse.json({ streams });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      name,
      description,
      channelId,
      streamKey,
      rtmpUrl,
      sourceType,
      sourcePath,
      sourceFileIds,
      playlistSourceIds,
      shuffle,
      minHours,
      maxHours,
      startAt,
      encoder,
      copyMode,
      videoBitrate,
      audioBitrate,
      resolution,
      fps,
      preset,
      privacyStatus,
      categoryId,
      tags,
      playlistId,
      alteredContent,
      spinnerMode,
      spinnerEmojis,
      autoCreateSchedule,
      shuffleTitle,
      shuffleThumbnail,
      // Allow copy/duplicate flow to pass a source stream id
      duplicateFrom,
    } = body;

    // If duplicating, fetch the source stream first
    let source: any = null;
    if (duplicateFrom) {
      source = await db.stream.findFirst({
        where: { id: duplicateFrom, userId: user.id },
      });
      if (!source) {
        return NextResponse.json({ error: "Source stream not found" }, { status: 404 });
      }
    }

    const finalName = name || (source ? `${source.name} (copy)` : "");
    if (!finalName || !(streamKey || source?.streamKey)) {
      return NextResponse.json(
        { error: "Stream name and YouTube stream key are required" },
        { status: 400 }
      );
    }

    // Verify channel ownership if channelId provided
    if (channelId) {
      const channel = await db.channel.findFirst({
        where: { id: channelId, userId: user.id },
      });
      if (!channel) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 });
      }
    }

    // SECURITY: Validate that sourceFileIds and playlistSourceIds belong
    // to the calling user. Without this, a user could create a stream
    // with another user's file IDs and have FFmpeg stream the victim's
    // videos when the stream starts.
    if (Array.isArray(sourceFileIds) && sourceFileIds.length > 0) {
      const ownedFiles = await db.uploadedFile.findMany({
        where: { id: { in: sourceFileIds }, userId: user.id },
        select: { id: true },
      });
      const ownedFileIds = new Set(ownedFiles.map((f) => f.id));
      const unowned = sourceFileIds.filter((id: string) => !ownedFileIds.has(id));
      if (unowned.length > 0) {
        return NextResponse.json(
          { error: `You don't own ${unowned.length} of the selected file(s)` },
          { status: 403 }
        );
      }
    }
    if (Array.isArray(playlistSourceIds) && playlistSourceIds.length > 0) {
      const ownedPlaylists = await db.playlist.findMany({
        where: { id: { in: playlistSourceIds }, userId: user.id },
        select: { id: true },
      });
      const ownedPlaylistIds = new Set(ownedPlaylists.map((p) => p.id));
      const unowned = playlistSourceIds.filter((id: string) => !ownedPlaylistIds.has(id));
      if (unowned.length > 0) {
        return NextResponse.json(
          { error: `You don't own ${unowned.length} of the selected playlist(s)` },
          { status: 403 }
        );
      }
    }

    // SECURITY: Validate sourcePath to prevent path traversal. Without
    // this, a user could set sourcePath to /etc or /proc and have
    // FFmpeg stream arbitrary system files to YouTube.
    const effectiveSourceType = sourceType || source?.sourceType || "local";
    const effectiveSourcePath = sourcePath || source?.sourcePath || null;
    if (effectiveSourceType === "local" && effectiveSourcePath) {
      // For duplicate-from flow, the source path was already validated when
      // the source stream was created — but we re-validate anyway in case
      // the user passed a new sourcePath.
      const pathCheck = validateSourcePath(effectiveSourcePath);
      if (!pathCheck.ok) {
        return NextResponse.json(
          { error: `Invalid source path: ${pathCheck.reason}` },
          { status: 400 }
        );
      }
    }

    // Validate duration: minHours must be <= maxHours, and both must be
    // at least 0.25 (15 minutes). minHours=0 causes FFmpeg to exit almost
    // immediately (durationSeconds near 0), triggering the auto-retry
    // loop and burning through all 3 retries in seconds.
    const effectiveMinHours = minHours ?? source?.minHours ?? 2.0;
    const effectiveMaxHours = maxHours ?? source?.maxHours ?? 4.0;
    if (Number(effectiveMinHours) > Number(effectiveMaxHours)) {
      return NextResponse.json(
        { error: "Minimum duration cannot be greater than maximum duration" },
        { status: 400 }
      );
    }
    if (Number(effectiveMinHours) < 0.25) {
      return NextResponse.json(
        { error: "Minimum duration must be at least 0.25 hours (15 minutes)" },
        { status: 400 }
      );
    }

    const stream = await db.stream.create({
      data: {
        userId: user.id,
        channelId: channelId || source?.channelId || null,
        name: finalName,
        description: description !== undefined ? description : source?.description || null,
        streamKey: streamKey || source?.streamKey,
        rtmpUrl: rtmpUrl || source?.rtmpUrl || YOUTUBE_RTMP_BASE,
        sourceType: sourceType || source?.sourceType || "local",
        sourcePath: sourcePath || source?.sourcePath || null,
        sourceFileIds: sourceFileIds
          ? (typeof sourceFileIds === "string" ? sourceFileIds : JSON.stringify(sourceFileIds))
          : (source?.sourceFileIds || null),
        playlistSourceIds: playlistSourceIds
          ? (typeof playlistSourceIds === "string"
              ? playlistSourceIds
              : JSON.stringify(playlistSourceIds))
          : (source?.playlistSourceIds || null),
        shuffle: shuffle ?? source?.shuffle ?? true,
        minHours: minHours ?? source?.minHours ?? 2.0,
        maxHours: maxHours ?? source?.maxHours ?? 4.0,
        startAt: startAt ? new Date(startAt) : null,
        encoder: encoder || source?.encoder || "auto",
        copyMode: copyMode ?? source?.copyMode ?? false,
        videoBitrate: videoBitrate || source?.videoBitrate || "4500k",
        audioBitrate: audioBitrate || source?.audioBitrate || "160k",
        resolution: resolution || source?.resolution || "1920x1080",
        fps: fps || source?.fps || 30,
        preset: preset || source?.preset || "veryfast",
        privacyStatus: privacyStatus || source?.privacyStatus || "public",
        categoryId: categoryId || source?.categoryId || "22",
        tags: tags || source?.tags || null,
        playlistId: (typeof playlistId === "string" ? playlistId.trim() : playlistId) || source?.playlistId || null,
        alteredContent: alteredContent ?? source?.alteredContent ?? false,
        spinnerMode: spinnerMode || source?.spinnerMode || "off",
        spinnerEmojis: spinnerEmojis
          ? (typeof spinnerEmojis === "string" ? spinnerEmojis : JSON.stringify(spinnerEmojis))
          : (source?.spinnerEmojis || null),
        autoCreateSchedule: autoCreateSchedule ?? source?.autoCreateSchedule ?? false,
        shuffleTitle: shuffleTitle ?? source?.shuffleTitle ?? false,
        shuffleThumbnail: shuffleThumbnail ?? source?.shuffleThumbnail ?? false,
        status: "scheduled",
      },
    });

    // === PICK TITLE & THUMBNAIL AT SCHEDULE CREATION TIME ===
    // (NOT at stream start). This advances the channel's rotator indexes
    // so the next schedule gets the next title/thumbnail in the rotation.
    // The picked values are stored on the stream and used when the stream
    // actually starts (auto or manual).
    const effectiveChannelId = stream.channelId;
    if (effectiveChannelId) {
      try {
        const effectiveSpinnerMode = stream.spinnerMode || "off";
        const effectiveSpinnerEmojis = stream.spinnerEmojis
          ? JSON.parse(stream.spinnerEmojis)
          : [];
        const picked = await pickTitleAndThumbnail(
          effectiveChannelId,
          effectiveSpinnerMode,
          effectiveSpinnerEmojis,
          stream.shuffleTitle || false,
          stream.shuffleThumbnail || false
        );
        await db.stream.update({
          where: { id: stream.id },
          data: {
            resolvedTitle: picked.resolvedTitle,
            resolvedThumbnailPath: picked.resolvedThumbnailPath,
            resolvedThumbnailMime: picked.resolvedThumbnailMime,
          },
        });
        if (picked.resolvedTitle) {
          console.log(`[Create] Picked title for stream ${stream.id}: "${picked.resolvedTitle}"`);
        }
      } catch (err: any) {
        console.warn("[Create] Failed to pick title/thumbnail:", err.message);
      }
    }

    // Re-fetch the stream with resolved fields
    const updatedStream = await db.stream.findUnique({ where: { id: stream.id } });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "info",
        category: "stream",
        message: duplicateFrom
          ? `Stream duplicated: ${finalName}`
          : `Stream created: ${finalName}`,
        details: `Stream ID: ${stream.id}`,
      },
    });

    return NextResponse.json({ stream: updatedStream });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
