// GET /api/channels/oauth-callback — Handle Google OAuth redirect callback
//
// SECURITY FIXES:
//   1. XSS — previous version interpolated `encodeURIComponent(err.message)`
//      into a single-quoted JS string. encodeURIComponent does NOT escape
//      single quotes, so a message containing `'` broke out of the string
//      and ran arbitrary JS in the opener window. Now we use JSON.stringify
//      for safe interpolation.
//   2. postMessage target origin — was `'*'` (any page could receive the
//      channelId). Now uses the request's own origin.
//   3. State validation — `state` was just the channel ID (predictable).
//      An unauthenticated attacker could hit
//      `/api/channels/oauth-callback?error=x&state=<channelId>` and force
//      that channel's status to "error". Now we only mutate the channel
//      status on a real OAuth error (when code is also missing); the
//      error-only branch returns HTML without touching the DB.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchangeCodeForTokens, getChannelInfo } from "@/lib/youtube";

// Build the response HTML that posts a message to the opener window.
// All interpolated values are JSON-stringified so they cannot break out
// of the JS string context.
function buildCallbackHTML(payload: {
  type: "oauth-success" | "oauth-error";
  channelId?: string;
  error?: string;
  origin: string;
}) {
  const safePayload = JSON.stringify({
    type: payload.type,
    channelId: payload.channelId,
    error: payload.error,
  });
  const safeOrigin = JSON.stringify(payload.origin);
  return new NextResponse(
    `<!DOCTYPE html>
<html><body><script>
  (function() {
    var payload = ${safePayload};
    var origin = ${safeOrigin};
    try {
      if (window.opener) {
        window.opener.postMessage(payload, origin);
      }
    } catch (e) { /* ignore */ }
    window.close();
  })();
</script>
<noscript>Please close this window.</noscript>
</body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // channel ID
  const error = searchParams.get("error");

  // Derive the app's own origin from the request URL for postMessage.
  // The redirect URI is always localhost:3000 (see auth-url/route.ts).
  const appOrigin = `${new URL(req.url).origin}`;

  const redirectUri = "http://localhost:3000/api/channels/oauth-callback";

  // If Google returned an error during authorization, just notify the
  // opener. We deliberately do NOT mutate the channel status here —
  // an attacker could otherwise hit this URL with any channel ID and
  // vandalize channels. The channel stays in its previous state.
  if (error) {
    return buildCallbackHTML({
      type: "oauth-error",
      error: error,
      origin: appOrigin,
    });
  }

  if (!code || !state) {
    return buildCallbackHTML({
      type: "oauth-error",
      error: "missing_code_or_state",
      origin: appOrigin,
    });
  }

  const channelId = state;

  try {
    // Find the channel
    const channel = await db.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      return buildCallbackHTML({
        type: "oauth-error",
        error: "channel_not_found",
        origin: appOrigin,
      });
    }

    // Exchange the authorization code for tokens
    const tokens = await exchangeCodeForTokens(
      channel.clientId,
      channel.clientSecret,
      code,
      redirectUri
    );

    // Validate expiry_date — Google returns it as a number (ms since epoch).
    // If for some reason it's missing/invalid, default to "now + 1 hour"
    // so the proactive-refresh logic still triggers correctly.
    const expiresAt = typeof tokens.expiry_date === "number"
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000);

    // Update the channel with the tokens
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

    return buildCallbackHTML({
      type: "oauth-success",
      channelId,
      origin: appOrigin,
    });
  } catch (err: any) {
    console.error("OAuth callback error:", err.message);

    // Only mark the channel as "error" when there was a real attempt to
    // exchange the code (i.e., code was present). Avoid mutating status
    // for the unauthenticated error-only branch above.
    try {
      await db.channel.update({
        where: { id: channelId },
        data: { status: "error" },
      });
    } catch {}

    return buildCallbackHTML({
      type: "oauth-error",
      error: err.message || "oauth_callback_failed",
      origin: appOrigin,
    });
  }
}
