// GET /api/channels — List user's channels
// POST /api/channels — Create a new channel (with Google Cloud credentials)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const channels = await db.channel.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      // SECURITY: use `select` to exclude sensitive OAuth fields
      // (accessToken, refreshToken) from the response. Previously these
      // were returned to the browser on every channel list fetch — an
      // XSS or malicious extension could exfiltrate them and impersonate
      // the user's YouTube channels indefinitely (refresh tokens don't
      // expire). clientId and clientSecret are still included because
      // the channel edit form needs them for pre-filling.
      select: {
        id: true,
        userId: true,
        name: true,
        description: true,
        youtubeChannelId: true,
        youtubeChannelName: true,
        clientId: true,
        // clientSecret is EXCLUDED from list response (encrypted in DB)
        // accessToken and refreshToken are EXCLUDED
        tokenExpiresAt: true,
        status: true,
        lastSyncAt: true,
        titleRotatorIndex: true,
        thumbnailRotatorIndex: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            streams: true,
            files: true,
            titles: true,
            thumbnails: true,
            playlists: true,
          },
        },
      },
    });

    return NextResponse.json({ channels });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, description, clientId, clientSecret } = body;

    if (!name || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Name, clientId, and clientSecret are required" },
        { status: 400 }
      );
    }

    const channel = await db.channel.create({
      data: {
        userId: user.id,
        name,
        description: description || null,
        clientId,
        clientSecret: encrypt(clientSecret),
        status: "inactive",
      },
    });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "info",
        category: "channel",
        message: `Channel created: ${name}`,
        details: `Channel ID: ${channel.id}`,
      },
    });

    return NextResponse.json({ channel });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
