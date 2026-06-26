// GET /api/dashboard — Get dashboard summary (counts, recent activity)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [channels, streams, files, titles, thumbnails, recentLogs, liveStreams] = await Promise.all([
      db.channel.count({ where: { userId: user.id } }),
      db.stream.count({ where: { userId: user.id } }),
      db.uploadedFile.count({ where: { userId: user.id } }),
      db.titleItem.count({ where: { userId: user.id } }),
      db.thumbnailItem.count({ where: { userId: user.id } }),
      db.activityLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.stream.findMany({
        where: { userId: user.id, status: "live" },
        include: { channel: { select: { name: true } } },
      }),
    ]);

    const channelList = await db.channel.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        status: true,
        youtubeChannelName: true,
        lastSyncAt: true,
        _count: {
          select: {
            streams: true,
            files: true,
            titles: true,
            thumbnails: true,
          },
        },
      },
    });

    const recentStreams = await db.stream.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { channel: { select: { name: true } } },
    });

    return NextResponse.json({
      counts: {
        channels,
        streams,
        files,
        titles,
        thumbnails,
        liveStreams: liveStreams.length,
      },
      liveStreams,
      channelList,
      recentStreams,
      recentLogs,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
