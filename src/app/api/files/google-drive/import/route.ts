// POST /api/files/google-drive/import — Import a file from Google Drive
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { downloadDriveFile } from "@/lib/gdrive";
import { UPLOAD_DIR } from "@/lib/constants";
import path from "path";
import fs from "fs/promises";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { fileId, fileName, channelId } = body;

    if (!fileId || !fileName) {
      return NextResponse.json(
        { error: "fileId and fileName are required" },
        { status: 400 }
      );
    }

    if (!channelId) {
      return NextResponse.json(
        { error: "A connected channel is required for Google Drive access" },
        { status: 400 }
      );
    }

    // Get the channel's OAuth credentials
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

    // Use per-channel upload directory
    const uploadDir = path.join(UPLOAD_DIR, "channels", channelId);
    await fs.mkdir(uploadDir, { recursive: true });

    const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const localPath = path.join(uploadDir, safeName);

    // Download the file from Google Drive
    const { size, mimeType } = await downloadDriveFile(
      fileId,
      localPath,
      channel.accessToken,
      channel.refreshToken || undefined,
      channel.clientId,
      channel.clientSecret
    );

    // Create database record (file is automatically assigned to this channel)
    const record = await db.uploadedFile.create({
      data: {
        userId: user.id,
        channelId, // File is scoped to this channel
        name: safeName,
        originalName: fileName,
        mimeType,
        size,
        storageType: "gdrive",
        storagePath: localPath,
        gdriveFileId: fileId,
        status: "ready",
      },
    });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "success",
        category: "file",
        message: `Imported from Google Drive to ${channel.name}: ${fileName}`,
      },
    });

    return NextResponse.json({ file: record });
  } catch (error: any) {
    console.error("Google Drive import error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
