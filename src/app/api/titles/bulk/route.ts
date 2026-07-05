// POST /api/titles/bulk — Create multiple titles at once (one per line)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { channelId, titles } = body;

    if (!channelId || !titles || !Array.isArray(titles)) {
      return NextResponse.json(
        { error: "channelId and titles[] are required" },
        { status: 400 }
      );
    }

    // Cap the array size to prevent DoS via huge requests.
    if (titles.length > 500) {
      return NextResponse.json(
        { error: "Too many titles in one request (max 500). Split into smaller batches." },
        { status: 400 }
      );
    }

    // Filter to non-empty strings only. Previously the code would throw
    // `TypeError: title.trim is not a function` if any element was a
    // number/object/null, aborting the whole transaction with a 500.
    const cleanTitles: string[] = [];
    for (const t of titles) {
      if (typeof t === "string") {
        const trimmed = t.trim();
        if (trimmed) cleanTitles.push(trimmed);
      }
    }
    if (cleanTitles.length === 0) {
      return NextResponse.json(
        { error: "No valid (non-empty) titles provided" },
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
    let nextOrder = (maxOrder._max.sortOrder || 0) + 1;

    // Create all titles in a transaction
    const created = await db.$transaction(
      cleanTitles.map((title: string) =>
        db.titleItem.create({
          data: {
            userId: user.id,
            channelId,
            title,
            sortOrder: nextOrder++,
          },
        })
      )
    );

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "info",
        category: "channel",
        message: `${created.length} titles added to ${channel.name}`,
      },
    });

    return NextResponse.json({ count: created.length, titles: created });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
