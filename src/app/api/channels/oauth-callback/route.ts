// GET /api/channels/oauth-callback — Handle Google OAuth redirect callback
// Google redirects here after user authorizes. We exchange the code for tokens.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeCodeForTokens, getChannelInfo } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // channel ID
  const error = searchParams.get("error");

  // Build redirect URI (must match the one used in getAuthUrl)
  const protocol = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host") || req.headers.get("x-forwarded-host");
  const redirectUri = `${protocol}://${host}/api/channels/oauth-callback`;

  // If Google returned an error
  if (error) {
    return NextResponse.redirect(
      new URL(`/?oauth_error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`/?oauth_error=missing_code_or_state`, req.url)
    );
  }

  const channelId = state;

  try {
    // Find the channel
    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return NextResponse.redirect(
        new URL(`/?oauth_error=channel_not_found`, req.url)
      );
    }

    // Exchange the authorization code for tokens
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

    // Try to fetch YouTube channel info
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
        userId: channel.userId,
        level: "success",
        category: "channel",
        message: `Channel ${channel.name} connected to YouTube${channelInfo ? ` (${channelInfo.title})` : ""}`,
      },
    });

    // Redirect back to the app with success
    return NextResponse.redirect(
      new URL(`/?oauth_success=${channelId}`, req.url)
    );
  } catch (err: any) {
    console.error("OAuth callback error:", err.message);

    // Mark channel as error
    try {
      await db.channel.update({
        where: { id: channelId },
        data: { status: "error" },
      });
    } catch {}

    return NextResponse.redirect(
      new URL(`/?oauth_error=${encodeURIComponent(err.message)}`, req.url)
    );
  }
}
