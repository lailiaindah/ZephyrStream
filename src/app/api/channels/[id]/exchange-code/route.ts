// POST /api/channels/[id]/exchange-code — Exchange OAuth code for tokens
// Accepts either { code: "..." } or { redirectUrl: "http://localhost:3000/..." }
// The redirectUrl approach lets users paste the full URL from browser address bar
// after Google redirects (works without domain — uses localhost redirect URI).
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
    let code = body.code;
    const redirectUrl = body.redirectUrl;

    // If user pasted the full redirect URL, extract the code from it
    if (!code && redirectUrl) {
      try {
        const url = new URL(redirectUrl);
        code = url.searchParams.get("code");
      } catch {
        return NextResponse.json(
          { error: "Invalid URL format. Paste the full URL from the browser address bar." },
          { status: 400 }
        );
      }
    }

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code not found. Paste the full URL including the code parameter." },
        { status: 400 }
      );
    }

    // The redirect URI must match what was used in getAuthUrl
    const redirectUri = "http://localhost:3000/api/channels/oauth-callback";

    const tokens = await exchangeCodeForTokens(
      channel.clientId,
      channel.clientSecret,
      code,
      redirectUri
    );

    // Update the channel with the tokens.
    // Validate expiry_date — Google returns it as a number (ms since epoch),
    // but if the field is missing/invalid we default to "now + 1 hour" so
    // the proactive-refresh logic in the scheduler still works correctly.
    // `new Date(undefined)` would produce Invalid Date, which Prisma
    // stores as an invalid value and breaks expiry comparisons.
    const expiresAt = typeof tokens.expiry_date === "number"
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    await db.channel.update({
      where: { id: channel.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || channel.refreshToken,
        tokenExpiresAt: expiresAt,
        status: "active",
        lastSyncAt: new Date(),
      },
    });

    // Fetch YouTube channel info
    let channelInfo = null;
    try {
      channelInfo = await getChannelInfo(channel.id);
      if (channelInfo) {
        await db.channel.update({
          where: { id: channel.id },
          data: {
            youtubeChannelId: channelInfo.id,
            youtubeChannelName: channelInfo.title,
          },
        });
      }
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
