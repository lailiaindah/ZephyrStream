// POST /api/channels/[id]/auth-url — Get the Google OAuth URL for this channel
//
// IMPORTANT: The redirect URI is derived from the request's own origin
// (e.g. http://57.131.47.229:3000 or https://mydomain.com). Previously
// this was hardcoded to http://localhost:3000 — which only works when
// the user accesses the app from the VPS itself. For remote VPS access
// via IP or domain, Google would redirect to the user's own localhost
// (their personal machine), and the OAuth callback never reached the
// server.
//
// The user MUST register this exact redirect URI in Google Cloud
// Console → APIs & Services → Credentials → OAuth 2.0 Client ID →
// Authorized redirect URIs. We return the redirectUri in the response
// so the frontend can display it for the user to copy.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAuthUrl } from "@/lib/youtube";

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

    // Derive the redirect URI from the request's own origin so Google
    // redirects back to the same host the user is currently accessing.
    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/channels/oauth-callback`;

    const authUrl = getAuthUrl(
      channel.clientId,
      channel.clientSecret,
      channel.id, // state = channel ID
      redirectUri
    );

    return NextResponse.json({ authUrl, redirectUri });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
