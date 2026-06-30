// GET /api/quota — Get YouTube API quota usage estimate for today
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// YouTube Data API v3 quota costs (official):
// - liveBroadcasts.insert: 50 units
// - liveBroadcasts.update: 50 units
// - liveBroadcasts.transition: 50 units
// - liveBroadcasts.bind: 50 units
// - thumbnails.set: 50 units
// - channels.list: 1 unit
// - liveStreams.insert: 50 units
// Daily limit: 10,000 units per project (per channel credentials)

const QUOTA_COSTS: Record<string, number> = {
  "broadcast_created": 100, // insert (50) + bind (50)
  "broadcast_updated": 50,  // update
  "broadcast_completed": 50, // transition to complete
  "channel_info_fetched": 1, // channels.list
  "thumbnail_uploaded": 50,  // thumbnails.set
};

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get today's start time
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Fetch today's activity logs related to streams
    const logs = await db.activityLog.findMany({
      where: {
        userId: user.id,
        category: "stream",
        createdAt: { gte: todayStart },
      },
      select: { message: true, level: true, details: true },
    });

    // Estimate quota usage per channel
    const channels = await db.channel.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, status: true },
    });

    // Count stream events today
    let totalQuotaUsed = 0;
    const events: any[] = [];

    for (const log of logs) {
      const msg = log.message.toLowerCase();
      let cost = 0;
      let eventType = "";

      if (msg.includes("auto-started") || msg.includes("stream started")) {
        cost = QUOTA_COSTS.broadcast_created;
        eventType = "broadcast_created";
      } else if (msg.includes("auto-stopped") || msg.includes("stream stopped")) {
        cost = QUOTA_COSTS.broadcast_completed;
        eventType = "broadcast_completed";
      } else if (msg.includes("auto-restart succeeded")) {
        cost = QUOTA_COSTS.broadcast_updated;
        eventType = "broadcast_updated";
      }

      if (cost > 0) {
        totalQuotaUsed += cost;
        events.push({ type: eventType, cost, message: log.message });
      }
    }

    const DAILY_QUOTA = 10000;
    const remaining = DAILY_QUOTA - totalQuotaUsed;
    const usagePercent = (totalQuotaUsed / DAILY_QUOTA) * 100;

    return NextResponse.json({
      dailyLimit: DAILY_QUOTA,
      used: totalQuotaUsed,
      remaining,
      usagePercent: Math.round(usagePercent * 10) / 10,
      eventsToday: events.length,
      channels: channels.length,
      perChannelQuota: channels.length > 0 ? DAILY_QUOTA * channels.length : DAILY_QUOTA,
      perChannelUsed: channels.length > 0 ? Math.round(totalQuotaUsed / channels.length) : totalQuotaUsed,
      events: events.slice(-20), // last 20 events
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
