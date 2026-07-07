// POST /api/files/google-drive/list — List files in a Google Drive folder
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { listDriveFiles } from "@/lib/gdrive";
import { decrypt } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { channelId, folderId } = body;

    if (!channelId) {
      return NextResponse.json(
        { error: "A connected channel is required" },
        { status: 400 }
      );
    }

    const channel = await db.channel.findFirst({
      where: { id: channelId, userId: user.id },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }
    if (!channel.accessToken) {
      return NextResponse.json(
        { error: "Channel is not connected. Please authorize it first." },
        { status: 400 }
      );
    }

    // Decrypt credentials before passing to Google Drive API
    const files = await listDriveFiles(
      decrypt(channel.accessToken),
      channel.refreshToken ? decrypt(channel.refreshToken) : undefined,
      channel.clientId,
      decrypt(channel.clientSecret),
      folderId || "root"
    );

    return NextResponse.json({ files });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
