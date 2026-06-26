// GET /api/titles — List titles (optionally filtered by channelId)
// POST /api/titles — Create a new title
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");

    // Verify channel ownership if channelId provided
    if (channelId) {
      const channel = await db.channel.findFirst({
        where: { id: channelId, userId: user.id },
      });
      if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const titles = await db.titleItem.findMany({
      where: {
        userId: user.id,
        ...(channelId ? { channelId } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: { channel: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ titles });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { channelId, title, emoji } = body;

    if (!channelId || !title) {
      return NextResponse.json(
        { error: "Channel ID and title are required" },
        { status: 400 }
      );
    }

    // Verify channel ownership
    const channel = await db.channel.findFirst({
      where: { id: channelId, userId: user.id },
    });
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    // Get the next sortOrder
    const maxOrder = await db.titleItem.aggregate({
      where: { channelId },
      _max: { sortOrder: true },
    });

    const titleItem = await db.titleItem.create({
      data: {
        userId: user.id,
        channelId,
        title,
        emoji: emoji || null,
        sortOrder: (maxOrder._max.sortOrder || 0) + 1,
      },
    });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "info",
        category: "channel",
        message: `Title added to ${channel.name}: "${title}"`,
      },
    });

    return NextResponse.json({ title: titleItem });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
