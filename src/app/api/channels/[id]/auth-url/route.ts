// POST /api/channels/[id]/auth-url — Get the Google OAuth URL for this channel
//
// REDIRECT URI POLICY:
// Google OAuth only allows these redirect URIs for HTTP (no HTTPS):
//   - http://localhost:PORT/...  (for development/testing)
//   - http://127.0.0.1:PORT/...  (same as localhost)
//
// For non-localhost HTTP (e.g. http://57.131.47.229:3000), Google REJECTS
// the request with "Error 400: invalid_request" because:
//   1. Google doesn't allow bare IP addresses as redirect URIs
//   2. Google requires HTTPS for non-localhost redirect URIs
//
// SOLUTION: Always use http://localhost:3000 as the redirect URI.
// Since the user accesses the app remotely (not from localhost), Google
// will redirect to http://localhost:3000/api/channels/oauth-callback?code=xxx
// — which the user's browser can't reach (localhost on their machine
// doesn't run the app). The user must then:
//   1. Copy the full URL from the browser address bar (which contains the
//      authorization code)
//   2. Paste it into the "Exchange Code" dialog in ZephyrStream
//
// The user MUST register http://localhost:3000/api/channels/oauth-callback
// in Google Cloud Console → Credentials → OAuth 2.0 Client ID →
// Authorized redirect URIs.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAuthUrl } from "@/lib/youtube";
import { decrypt } from "@/lib/crypto";

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

    // Always use localhost:3000 as redirect URI — this is the only HTTP
    // redirect URI that Google accepts without HTTPS/domain.
    // The user will need to manually copy the redirect URL and paste it
    // into the "Exchange Code" dialog after Google redirects.
    const redirectUri = "http://localhost:3000/api/channels/oauth-callback";

    const authUrl = getAuthUrl(
      channel.clientId,
      decrypt(channel.clientSecret),
      channel.id, // state = channel ID
      redirectUri
    );

    return NextResponse.json({ authUrl, redirectUri });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
