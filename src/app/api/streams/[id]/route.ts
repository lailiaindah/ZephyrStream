// /api/streams/[id] — Get, update, or delete a stream
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pickTitleAndThumbnail } from "@/lib/youtube";
import { validateSourcePath } from "@/lib/path-validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const stream = await db.stream.findFirst({
      where: { id, userId: user.id },
      include: {
        channel: {
          select: { id: true, name: true, youtubeChannelName: true },
        },
      },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    return NextResponse.json({ stream });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const stream = await db.stream.findFirst({
      where: { id, userId: user.id },
    });
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const body = await req.json();
    // NOTE: "status" was previously in this list, which let any client
    // PATCH a stream directly to "live" / "ended" without going through
    // the start/stop endpoints — bypassing FFmpeg process management.
    // Removed to prevent that bypass. Status is only mutated by
    // /start, /stop, and the scheduler.
    const allowedFields = [
      "name", "description", "channelId", "streamKey", "rtmpUrl",
      "sourceType", "sourcePath", "sourceFileIds", "playlistSourceIds", "shuffle",
      "minHours", "maxHours",
      "startAt", "encoder", "copyMode", "videoBitrate", "audioBitrate",
      "resolution", "fps", "preset", "privacyStatus", "categoryId", "tags",
      "playlistId", "alteredContent", "spinnerMode", "spinnerEmojis",
      "autoCreateSchedule", "shuffleTitle", "shuffleThumbnail",
    ];

    // SECURITY: validate sourcePath before any DB write
    if (body.sourcePath !== undefined && body.sourcePath) {
      const pathCheck = validateSourcePath(body.sourcePath);
      if (!pathCheck.ok) {
        return NextResponse.json(
          { error: `Invalid source path: ${pathCheck.reason}` },
          { status: 400 }
        );
      }
    }

    // Validate duration consistency
    if (body.minHours !== undefined || body.maxHours !== undefined) {
      const minH = body.minHours !== undefined ? Number(body.minHours) : stream.minHours;
      const maxH = body.maxHours !== undefined ? Number(body.maxHours) : stream.maxHours;
      if (Number(minH) > Number(maxH)) {
        return NextResponse.json(
          { error: "Minimum duration cannot be greater than maximum duration" },
          { status: 400 }
        );
      }
      if (Number(minH) < 0.25) {
        return NextResponse.json(
          { error: "Minimum duration must be at least 0.25 hours (15 minutes)" },
          { status: 400 }
        );
      }
    }

    const updateData: any = {};
    // Fields that should be trimmed if they're strings (avoid storing whitespace-only values)
    const trimFields = ["playlistId", "tags", "streamKey", "name", "description"];
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "startAt") {
          updateData[field] = body[field] ? new Date(body[field]) : null;
        } else if (field === "sourceFileIds" || field === "spinnerEmojis" || field === "playlistSourceIds") {
          updateData[field] = body[field] ? JSON.stringify(body[field]) : null;
        } else if (trimFields.includes(field) && typeof body[field] === "string") {
          // Trim whitespace and convert empty strings to null
          updateData[field] = body[field].trim() || null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    // SECURITY: Validate channel ownership if channelId is being changed.
    // Previously PATCH allowed setting channelId to ANY channel — including
    // another user's channel. At stream start, getValidAccessToken would
    // happily return the victim's channel with its OAuth tokens, and
    // createOrUpdateBroadcast would create a broadcast under the victim's
    // YouTube account while FFmpeg pushed video to the victim's stream key.
    if (body.channelId !== undefined && body.channelId) {
      const targetChannel = await db.channel.findFirst({
        where: { id: body.channelId, userId: user.id },
      });
      if (!targetChannel) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 });
      }
    }

    // SECURITY: Validate that sourceFileIds and playlistSourceIds belong
    // to the calling user. Without this, a user could set sourceFileIds to
    // another user's file IDs and have FFmpeg stream the victim's videos.
    if (body.sourceFileIds !== undefined && Array.isArray(body.sourceFileIds) && body.sourceFileIds.length > 0) {
      const ownedFiles = await db.uploadedFile.findMany({
        where: { id: { in: body.sourceFileIds }, userId: user.id },
        select: { id: true },
      });
      const ownedFileIds = new Set(ownedFiles.map((f) => f.id));
      const unowned = body.sourceFileIds.filter((id: string) => !ownedFileIds.has(id));
      if (unowned.length > 0) {
        return NextResponse.json(
          { error: `You don't own ${unowned.length} of the selected file(s)` },
          { status: 403 }
        );
      }
    }
    if (body.playlistSourceIds !== undefined && Array.isArray(body.playlistSourceIds) && body.playlistSourceIds.length > 0) {
      const ownedPlaylists = await db.playlist.findMany({
        where: { id: { in: body.playlistSourceIds }, userId: user.id },
        select: { id: true },
      });
      const ownedPlaylistIds = new Set(ownedPlaylists.map((p) => p.id));
      const unowned = body.playlistSourceIds.filter((id: string) => !ownedPlaylistIds.has(id));
      if (unowned.length > 0) {
        return NextResponse.json(
          { error: `You don't own ${unowned.length} of the selected playlist(s)` },
          { status: 403 }
        );
      }
    }

    const updated = await db.stream.update({
      where: { id },
      data: updateData,
    });

    // === RE-PICK TITLE & THUMBNAIL IF CHANNEL OR SPINNER CHANGED ===
    // If the user changed the channelId, spinnerMode, or spinnerEmojis,
    // the previously-picked title/thumbnail are stale — pick fresh ones.
    const channelChanged = body.channelId !== undefined;
    const spinnerChanged =
      body.spinnerMode !== undefined || body.spinnerEmojis !== undefined;
    if ((channelChanged || spinnerChanged) && updated.channelId && updated.status === "scheduled") {
      try {
        const effectiveSpinnerMode = updated.spinnerMode || "off";
        const effectiveSpinnerEmojis = updated.spinnerEmojis
          ? JSON.parse(updated.spinnerEmojis)
          : [];
        const picked = await pickTitleAndThumbnail(
          updated.channelId,
          effectiveSpinnerMode,
          effectiveSpinnerEmojis,
          updated.shuffleTitle || false,
          updated.shuffleThumbnail || false
        );
        await db.stream.update({
          where: { id: updated.id },
          data: {
            resolvedTitle: picked.resolvedTitle,
            resolvedThumbnailPath: picked.resolvedThumbnailPath,
            resolvedThumbnailMime: picked.resolvedThumbnailMime,
          },
        });
        console.log(`[PATCH] Re-picked title for stream ${updated.id}: "${picked.resolvedTitle}"`);
      } catch (err: any) {
        console.warn("[PATCH] Failed to re-pick title/thumbnail:", err.message);
      }
    }

    // Re-fetch with resolved fields
    const finalStream = await db.stream.findUnique({ where: { id: updated.id } });

    return NextResponse.json({ stream: finalStream });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const stream = await db.stream.findFirst({
      where: { id, userId: user.id },
    });
    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    // Stop the process if it's running
    if (stream.pid) {
      try {
        process.kill(stream.pid, "SIGTERM");
      } catch {}
    }

    await db.stream.delete({ where: { id } });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "warn",
        category: "stream",
        message: `Stream deleted: ${stream.name}`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
