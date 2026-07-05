// POST /api/streams/[id]/stop — Stop a running stream
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stopFFmpegStream } from "@/lib/ffmpeg";
import { transitionBroadcast } from "@/lib/youtube";
import { createNextDaySchedule } from "@/lib/scheduler";

export async function POST(
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

    if (stream.status !== "live" && stream.status !== "preparing") {
      return NextResponse.json(
        { error: "Stream is not running" },
        { status: 400 }
      );
    }

    // === ATOMIC LOCK: claim the stream for stopping. If two concurrent
    // stop requests arrive, only one proceeds — the other gets count=0
    // and returns 409. This prevents double-calling stopFFmpegStream
    // and double-charging YouTube API quota on transitionBroadcast.
    const claim = await db.stream.updateMany({
      where: {
        id,
        status: { in: ["live", "preparing"] },
      },
      data: { status: "stopping" },
    });
    if (claim.count === 0) {
      return NextResponse.json(
        { error: "Stream is already being stopped by another request" },
        { status: 409 }
      );
    }

    // Parse body to check if user wants to skip reschedule
    let skipReschedule = false;
    try {
      const body = await req.json();
      skipReschedule = body?.skipReschedule === true;
    } catch {
      // No body or invalid JSON — default to normal behavior (reschedule)
    }

    // Stop the FFmpeg process
    let stopped = false;
    if (stream.pid) {
      stopped = await stopFFmpegStream(stream.pid);
    }

    // Transition the YouTube broadcast to complete (with retry).
    // YouTube needs time to process the transition — if it fails, the
    // retry logic will wait and retry up to 5 times.
    if (stream.channelId && stream.broadcastId) {
      try {
        await transitionBroadcast(
          stream.channelId,
          stream.broadcastId,
          "complete"
        );
        console.log(`[Stop] YouTube broadcast ${stream.broadcastId} completed successfully`);
      } catch (err: any) {
        console.warn(`[Stop] YouTube broadcast transition failed after retries: ${err.message}`);
        await db.activityLog.create({
          data: {
            userId: user.id,
            level: "warn",
            category: "stream",
            message: `YouTube broadcast may still be processing: ${stream.name}`,
            details: `Transition to "complete" failed: ${err.message}. YouTube Studio may need manual check.`,
          },
        }).catch(() => {});
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

    // If autoCreateSchedule is on AND user didn't choose "Stop Only",
    // create the next-day schedule (startAt + 24h, NOT endedAt + 24h).
    // Wrap in try/catch so a failure here doesn't fail the stop request
    // — the stream is already stopped successfully at this point.
    let nextSchedule = null;
    let rescheduleWarning: string | null = null;
    if (stream.autoCreateSchedule && !skipReschedule) {
      try {
        nextSchedule = await createNextDaySchedule(stream);
        if (nextSchedule) {
          await db.activityLog.create({
            data: {
              userId: user.id,
              level: "success",
              category: "stream",
              message: `Auto-created next-day schedule: ${stream.name}`,
              details: `Start at ${nextSchedule.startAt?.toISOString()}`,
            },
          });
        }
      } catch (schedErr: any) {
        console.warn(`[Stop] createNextDaySchedule failed: ${schedErr.message}`);
        rescheduleWarning = `Stream stopped, but next-day schedule creation failed: ${schedErr.message}`;
        await db.activityLog.create({
          data: {
            userId: user.id,
            level: "warn",
            category: "stream",
            message: `Next-day schedule creation failed for ${stream.name}`,
            details: schedErr.message,
          },
        }).catch(() => {});
      }
    } else if (stream.autoCreateSchedule && skipReschedule) {
      await db.activityLog.create({
        data: {
          userId: user.id,
          level: "info",
          category: "stream",
          message: `Stream stopped without reschedule: ${stream.name}`,
          details: "User chose 'Stop Only' — no next-day schedule created.",
        },
      });
    }

    return NextResponse.json({
      success: true,
      stopped,
      warning: rescheduleWarning,
      nextSchedule: nextSchedule
        ? {
            id: nextSchedule.id,
            startAt: nextSchedule.startAt,
          }
        : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
