// GET /api/streams — List user's streams
// POST /api/streams — Create a new stream
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { YOUTUBE_RTMP_BASE } from "@/lib/constants";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const streams = await db.stream.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        channel: {
          select: { id: true, name: true, youtubeChannelName: true },
        },
      },
    });

    return NextResponse.json({ streams });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      name,
      description,
      channelId,
      streamKey,
      rtmpUrl,
      sourceType,
      sourcePath,
      sourceFileIds,
      shuffle,
      durationMinutes,
      startAt,
      encoder,
      copyMode,
      videoBitrate,
      audioBitrate,
      resolution,
      fps,
      preset,
      privacyStatus,
      categoryId,
      tags,
      playlistId,
      madeForKids,
      alteredContent,
      spinnerMode,
      spinnerEmojis,
      autoReschedule,
    } = body;

    if (!name || !streamKey) {
      return NextResponse.json(
        { error: "Stream name and YouTube stream key are required" },
        { status: 400 }
      );
    }

    // Verify channel ownership if channelId provided
    if (channelId) {
      const channel = await db.channel.findFirst({
        where: { id: channelId, userId: user.id },
      });
      if (!channel) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 });
      }
    }

    const stream = await db.stream.create({
      data: {
        userId: user.id,
        channelId: channelId || null,
        name,
        description: description || null,
        streamKey,
        rtmpUrl: rtmpUrl || YOUTUBE_RTMP_BASE,
        sourceType: sourceType || "local",
        sourcePath: sourcePath || null,
        sourceFileIds: sourceFileIds ? JSON.stringify(sourceFileIds) : null,
        shuffle: shuffle ?? true,
        durationMinutes: durationMinutes || 180,
        startAt: startAt ? new Date(startAt) : null,
        encoder: encoder || "auto",
        copyMode: copyMode ?? false,
        videoBitrate: videoBitrate || "4500k",
        audioBitrate: audioBitrate || "160k",
        resolution: resolution || "1920x1080",
        fps: fps || 30,
        preset: preset || "veryfast",
        privacyStatus: privacyStatus || "public",
        categoryId: categoryId || "22",
        tags: tags || null,
        playlistId: playlistId || null,
        madeForKids: madeForKids ?? false,
        alteredContent: alteredContent ?? false,
        spinnerMode: spinnerMode || "off",
        spinnerEmojis: spinnerEmojis ? JSON.stringify(spinnerEmojis) : null,
        autoReschedule: autoReschedule ?? false,
        status: "scheduled",
      },
    });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "info",
        category: "stream",
        message: `Stream created: ${name}`,
        details: `Stream ID: ${stream.id}`,
      },
    });

    return NextResponse.json({ stream });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
