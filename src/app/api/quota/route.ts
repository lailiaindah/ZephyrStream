// GET /api/quota — Get YouTube API quota usage for today (explicit tracking)
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

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get today's start time in Pacific Time (YouTube quota resets at
    // midnight PT). Use Intl to get the correct offset (PST -08:00 or
    // PDT -07:00 depending on DST).
    const now = new Date();
    const ptDateParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const year = ptDateParts.find(p => p.type === "year")?.value || "2024";
    const month = ptDateParts.find(p => p.type === "month")?.value || "01";
    const day = ptDateParts.find(p => p.type === "day")?.value || "01";

    // Get the actual UTC offset for PT (handles DST automatically)
    const offsetParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      timeZoneName: "shortOffset",
    }).formatToParts(now);
    const offsetStr = offsetParts.find(p => p.type === "timeZoneName")?.value || "GMT-8";
    // offsetStr is like "GMT-8" or "GMT-7" — convert to "-08:00" / "-07:00"
    const offsetMatch = offsetStr.match(/GMT([+-])(\d+)/);
    const offsetSign = offsetMatch ? offsetMatch[1] : "-";
    const offsetHours = offsetMatch ? parseInt(offsetMatch[2]) : 8;
    const offsetFormatted = `${offsetSign}${String(offsetHours).padStart(2, "0")}:00`;

    const todayStart = new Date(`${year}-${month}-${day}T00:00:00${offsetFormatted}`);

    // === EXPLICIT QUOTA TRACKING ===
    // Sum the quotaCost column directly from activity logs.
    // This is accurate because quotaCost is set at the point of the
    // actual YouTube API call, not estimated from log message text.
    const quotaResult = await db.activityLog.aggregate({
      where: {
        userId: user.id,
        quotaCost: { gt: 0 },
        createdAt: { gte: todayStart },
      },
      _sum: { quotaCost: true },
      _count: true,
    });

    const totalQuotaUsed = quotaResult._sum.quotaCost || 0;
    const eventCount = quotaResult._count || 0;

    // Fetch events for display
    const events = await db.activityLog.findMany({
      where: {
        userId: user.id,
        quotaCost: { gt: 0 },
        createdAt: { gte: todayStart },
      },
      select: { message: true, quotaCost: true, createdAt: true, details: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const channels = await db.channel.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, status: true },
    });

    const DAILY_QUOTA = 10000;
    const remaining = DAILY_QUOTA - totalQuotaUsed;
    const usagePercent = (totalQuotaUsed / DAILY_QUOTA) * 100;

    return NextResponse.json({
      dailyLimit: DAILY_QUOTA,
      used: totalQuotaUsed,
      remaining,
      usagePercent: Math.round(usagePercent * 10) / 10,
      eventsToday: eventCount,
      channels: channels.length,
      perChannelQuota: channels.length > 0 ? DAILY_QUOTA * channels.length : DAILY_QUOTA,
      perChannelUsed: channels.length > 0 ? Math.round(totalQuotaUsed / channels.length) : totalQuotaUsed,
      events: events.map((e) => ({
        cost: e.quotaCost,
        message: e.message,
        details: e.details,
        time: e.createdAt.toISOString(),
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
