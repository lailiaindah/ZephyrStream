// POST /api/channels/[id]/exchange-code — Exchange OAuth code for tokens
// DEPRECATED: This route is kept for backward compatibility but the new
// OAuth flow uses /api/channels/oauth-callback (web redirect) instead.
// Google blocked the OOB flow, so this route will fail for new authorizations.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { exchangeCodeForTokens, getChannelInfo } from "@/lib/youtube";

export async function POST(
  req: NextRequest,
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

    const body = await req.json();
    const { code } = body;
    if (!code) {
      return NextResponse.json({ error: "Authorization code is required" }, { status: 400 });
    }

    // Build redirect URI from request (should match what was used in getAuthUrl)
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || req.headers.get("x-forwarded-host");
    const redirectUri = `${protocol}://${host}/api/channels/oauth-callback`;

    const tokens = await exchangeCodeForTokens(
      channel.clientId,
      channel.clientSecret,
      code,
      redirectUri
    );

    // Update the channel with the tokens
    await db.channel.update({
      where: { id: channel.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || channel.refreshToken,
        tokenExpiresAt: new Date(tokens.expiry_date),
        status: "active",
        lastSyncAt: new Date(),
      },
    });

    // Fetch YouTube channel info
    let channelInfo = null;
    try {
      channelInfo = await getChannelInfo(channel.id);
      await db.channel.update({
        where: { id: channel.id },
        data: {
          youtubeChannelId: channelInfo.id,
          youtubeChannelName: channelInfo.title,
        },
      });
    } catch (infoErr: any) {
      console.warn("Could not fetch channel info:", infoErr.message);
    }

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "success",
        category: "channel",
        message: `Channel ${channel.name} connected to YouTube`,
        details: channelInfo ? `YouTube channel: ${channelInfo.title}` : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      channelInfo,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
