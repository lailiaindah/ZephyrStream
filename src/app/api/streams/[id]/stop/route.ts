// POST /api/streams/[id]/stop — Stop a running stream
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stopFFmpegStream } from "@/lib/ffmpeg";
import { transitionBroadcast } from "@/lib/youtube";

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
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    if (stream.status !== "live" && stream.status !== "preparing") {
      return NextResponse.json(
        { error: "Stream is not running" },
        { status: 400 }
      );
    }

    // Stop the FFmpeg process
    let stopped = false;
    if (stream.pid) {
      stopped = await stopFFmpegStream(stream.pid);
    }

    // Transition the YouTube broadcast to complete (if applicable)
    if (stream.channelId && stream.broadcastId) {
      try {
        await transitionBroadcast(
          stream.channelId,
          stream.broadcastId,
          "complete"
        );
      } catch (err: any) {
        console.warn("Failed to transition broadcast to complete:", err.message);
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
        userId: user.id,
        level: "info",
        category: "stream",
        message: `Stream stopped: ${stream.name}`,
      },
    });

    return NextResponse.json({ success: true, stopped });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
