// /api/streams/[id] — Get, update, or delete a stream
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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
      "sourceType", "sourcePath", "sourceFileIds", "shuffle",
      "minHours", "maxHours",
      "startAt", "encoder", "copyMode", "videoBitrate", "audioBitrate",
      "resolution", "fps", "preset", "privacyStatus", "categoryId", "tags",
      "playlistId", "alteredContent", "spinnerMode", "spinnerEmojis",
      "autoCreateSchedule", "status",
    ];

    const updateData: any = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        if (field === "startAt") {
          updateData[field] = body[field] ? new Date(body[field]) : null;
        } else if (field === "sourceFileIds" || field === "spinnerEmojis") {
          updateData[field] = body[field] ? JSON.stringify(body[field]) : null;
        } else {
          updateData[field] = body[field];
        }
      }
    }

    const updated = await db.stream.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ stream: updated });
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
