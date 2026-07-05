// POST /api/channels/[id]/auth-url — Get the Google OAuth URL for this channel
// Uses http://localhost redirect (Google allows localhost without domain)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAuthUrl } from "@/lib/youtube";

export async function POST(
  _req: NextRequest,
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

    // Google allows http://localhost as redirect URI (no domain needed).
    // The callback handler at /api/channels/oauth-callback will receive
    // the code and exchange it for tokens.
    const redirectUri = "http://localhost:3000/api/channels/oauth-callback";

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
