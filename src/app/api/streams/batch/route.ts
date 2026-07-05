// POST /api/streams/batch — Batch operations on multiple streams
// Body: { action: "start" | "stop" | "delete", ids: string[] }
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stopFFmpegStream } from "@/lib/ffmpeg";
import { transitionBroadcast } from "@/lib/youtube";
import { createNextDaySchedule } from "@/lib/scheduler";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, ids } = body as { action: string; ids: string[] };

    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "action and ids[] are required" }, { status: 400 });
    }

    // Cap the batch size to prevent DoS via huge requests. Each ID
    // triggers a DB query plus (for stop) a transitionBroadcast API call
    // — a 10,000-element batch would tie up the server for minutes.
    if (ids.length > 50) {
      return NextResponse.json(
        { error: "Too many streams in one batch (max 50). Split into smaller batches." },
        { status: 400 }
      );
    }

    const results: any[] = [];

    for (const id of ids) {
      try {
        const stream = await db.stream.findFirst({ where: { id, userId: user.id } });
        if (!stream) { results.push({ id, success: false, error: "Not found" }); continue; }

        if (action === "delete") {
          if (stream.pid) { try { process.kill(stream.pid, "SIGTERM"); } catch {} }
          await db.stream.delete({ where: { id } });
          results.push({ id, success: true, action: "deleted" });
        }
        else if (action === "stop") {
          if (stream.status !== "live" && stream.status !== "preparing") {
            results.push({ id, success: false, error: "Not running" }); continue;
          }
          if (stream.pid) await stopFFmpegStream(stream.pid);
          // Capture YouTube transition errors instead of silently
          // swallowing — log them so the user knows YouTube may need
          // manual attention. Previously the empty catch {} hid all
          // failures, reporting success even when the broadcast stayed
          // in "live" state on YouTube's side.
          if (stream.channelId && stream.broadcastId) {
            try {
              await transitionBroadcast(stream.channelId, stream.broadcastId, "complete");
            } catch (ytErr: any) {
              await db.activityLog.create({
                data: {
                  userId: user.id,
                  level: "warn",
                  category: "stream",
                  message: `Batch stop: YouTube transition failed for ${stream.name}`,
                  details: ytErr.message,
                },
              }).catch(() => {});
            }
          }
          await db.stream.update({ where: { id }, data: { status: "ended", endedAt: new Date(), pid: null } });

          // If autoCreateSchedule is on, create the next-day schedule —
          // same behavior as the single-stream stop endpoint. Without
          // this, batch-stopping streams with autoCreateSchedule=true
          // would silently break the daily auto-streaming chain.
          if (stream.autoCreateSchedule) {
            try {
              await createNextDaySchedule(stream);
            } catch (schedErr: any) {
              await db.activityLog.create({
                data: {
                  userId: user.id,
                  level: "warn",
                  category: "stream",
                  message: `Batch stop: next-day schedule failed for ${stream.name}`,
                  details: schedErr.message,
                },
              }).catch(() => {});
            }
          }

          results.push({ id, success: true, action: "stopped" });
        }
        else if (action === "start") {
          if (stream.status === "live" || stream.status === "preparing") {
            results.push({ id, success: false, error: "Already running" }); continue;
          }
          // Mark for scheduler to pick up — set startAt to now.
          // NOTE: this only queues the stream; the scheduler's
          // autoStartScheduledStreams() will actually spawn FFmpeg on
          // the next tick (within 30s). To start immediately, use the
          // single-stream /api/streams/[id]/start endpoint instead.
          await db.stream.update({ where: { id }, data: { status: "scheduled", startAt: new Date(), retryCount: 0 } });
          results.push({ id, success: true, action: "queued for start" });
        }
        else {
          results.push({ id, success: false, error: "Unknown action" });
        }
      } catch (err: any) {
        results.push({ id, success: false, error: err.message });
      }
    }

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "info",
        category: "stream",
        message: `Batch ${action}: ${results.filter(r => r.success).length}/${ids.length} succeeded`,
      },
    }).catch(() => {});

    return NextResponse.json({ results, total: ids.length, succeeded: results.filter(r => r.success).length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
