// POST /api/thumbnails/shuffle — Randomize the sort order of all thumbnails for a channel
// Also resets the thumbnail rotator index to 0 so the new order starts fresh.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { resetThumbnailRotator } from "@/lib/youtube";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");

    if (!channelId) {
      return NextResponse.json({ error: "channelId is required" }, { status: 400 });
    }

    const channel = await db.channel.findFirst({
      where: { id: channelId, userId: user.id },
    });
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const thumbnails = await db.thumbnailItem.findMany({
      where: { userId: user.id, channelId },
      orderBy: { sortOrder: "asc" },
    });

    const shuffled = [...thumbnails];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    await db.$transaction(
      shuffled.map((t, idx) =>
        db.thumbnailItem.update({
          where: { id: t.id },
          data: { sortOrder: idx + 1 },
        })
      )
    );

    // Reset the rotator index so the next stream starts from the new first thumbnail
    await resetThumbnailRotator(channelId);

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "info",
        category: "channel",
        message: `Shuffled ${shuffled.length} thumbnails in ${channel.name} (rotator reset)`,
      },
    });

    return NextResponse.json({ success: true, count: shuffled.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
