// GET /api/channels/oauth-callback — Handle Google OAuth redirect callback
// This endpoint receives the redirect from Google after user authorizes.
// It works when the app is accessed from the same machine (localhost).
// For remote VPS access, the frontend handles the code via popup window.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeCodeForTokens, getChannelInfo } from "@/lib/youtube";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // channel ID
  const error = searchParams.get("error");

  const redirectUri = "http://localhost:3000/api/channels/oauth-callback";

  // If Google returned an error
  if (error) {
    return new NextResponse(
      `<html><body><script>
        window.opener.postMessage({ type: 'oauth-error', error: '${encodeURIComponent(error)}' }, '*');
        window.close();
      </script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      `<html><body><script>
        window.opener.postMessage({ type: 'oauth-error', error: 'missing_code_or_state' }, '*');
        window.close();
      </script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const channelId = state;

  try {
    // Find the channel
    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return new NextResponse(
        `<html><body><script>
          window.opener.postMessage({ type: 'oauth-error', error: 'channel_not_found' }, '*');
          window.close();
        </script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
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

    // Return HTML that posts message to opener window and closes popup
    return new NextResponse(
      `<html><body><script>
        window.opener.postMessage({ type: 'oauth-success', channelId: '${channelId}' }, '*');
        window.close();
      </script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err: any) {
    console.error("OAuth callback error:", err.message);

    try {
      await db.channel.update({
        where: { id: channelId },
        data: { status: "error" },
      });
    } catch {}

    return new NextResponse(
      `<html><body><script>
        window.opener.postMessage({ type: 'oauth-error', error: '${encodeURIComponent(err.message)}' }, '*');
        window.close();
      </script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
