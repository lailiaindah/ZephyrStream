// /api/streams/[id] — Get, update, or delete a stream
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { pickTitleAndThumbnail } from "@/lib/youtube";

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
    const allowedFields = [
      "name", "description", "channelId", "streamKey", "rtmpUrl",
      "sourceType", "sourcePath", "sourceFileIds", "playlistSourceIds", "shuffle",
      "minHours", "maxHours",
      "startAt", "encoder", "copyMode", "videoBitrate", "audioBitrate",
      "resolution", "fps", "preset", "privacyStatus", "categoryId", "tags",
      "playlistId", "alteredContent", "spinnerMode", "spinnerEmojis",
      "autoCreateSchedule", "shuffleTitle", "shuffleThumbnail", "status",
    ];

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
