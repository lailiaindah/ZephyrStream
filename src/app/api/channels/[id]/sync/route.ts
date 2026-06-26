// POST /api/channels/[id]/sync — Refresh channel info from YouTube
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getChannelInfo, refreshAccessToken } from "@/lib/youtube";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const channel = await db.channel.findFirst({
      where: { id, userId: user.id },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    if (!channel.refreshToken) {
      return NextResponse.json(
        { error: "Channel is not connected to YouTube. Please authorize first." },
        { status: 400 }
      );
    }

    // Refresh the access token
    await refreshAccessToken(channel.id);

    // Fetch the latest channel info
    const info = await getChannelInfo(channel.id);

    await db.channel.update({
      where: { id: channel.id },
      data: {
        youtubeChannelId: info.id,
        youtubeChannelName: info.title,
        lastSyncAt: new Date(),
        status: "active",
      },
    });

    return NextResponse.json({ success: true, channelInfo: info });
  } catch (error: any) {
    // Mark channel as errored
    try {
      const { id } = await params;
      await db.channel.update({
        where: { id },
        data: { status: "error" },
      });
    } catch {}

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
