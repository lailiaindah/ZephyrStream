// POST /api/files/shuffle — Mark a channel's files for shuffled playback order
// (The actual shuffle happens at stream start when FFmpeg picks files.
// This endpoint just toggles a "shuffle" flag on the most recent stream
// for the channel, OR returns a shuffled list of file IDs for the client
// to use when creating/updating a stream.)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { channelId } = body;

    if (!channelId) {
      return NextResponse.json({ error: "channelId is required" }, { status: 400 });
    }

    const channel = await db.channel.findFirst({
      where: { id: channelId, userId: user.id },
    });
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    // Fetch all files for this channel
    const files = await db.uploadedFile.findMany({
      where: { userId: user.id, channelId, status: "ready" },
      orderBy: { createdAt: "desc" },
    });

    // Fisher-Yates shuffle
    const shuffled = [...files];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return NextResponse.json({
      success: true,
      shuffledFileIds: shuffled.map((f) => f.id),
      count: shuffled.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
