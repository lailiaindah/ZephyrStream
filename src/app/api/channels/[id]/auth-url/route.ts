// POST /api/channels/[id]/auth-url — Get the Google OAuth URL for this channel
// Uses web redirect flow (NOT the deprecated OOB flow)
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

    // Build the redirect URI from the request origin.
    // This works for both HTTP (http://IP:3000) and HTTPS (https://domain).
    const origin = req.headers.get("origin") || req.headers.get("host");
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || req.headers.get("x-forwarded-host");
    const redirectUri = `${protocol}://${host}/api/channels/oauth-callback`;

    const authUrl = getAuthUrl(
      channel.clientId,
      channel.clientSecret,
      channel.id, // state = channel ID so callback knows which channel
      redirectUri
    );

    return NextResponse.json({ authUrl, redirectUri });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
