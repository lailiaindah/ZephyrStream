// GET /api/thumbnails — List thumbnails (optionally filtered by channelId)
// POST /api/thumbnails — Upload a thumbnail (multipart/form-data)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { UPLOAD_DIR, THUMBNAIL_EXTENSIONS } from "@/lib/constants";
import fs from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");

    if (channelId) {
      const channel = await db.channel.findFirst({
        where: { id: channelId, userId: user.id },
      });
      if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const thumbnails = await db.thumbnailItem.findMany({
      where: {
        userId: user.id,
        ...(channelId ? { channelId } : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: { channel: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ thumbnails });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const channelId = formData.get("channelId") as string;
    const files = formData.getAll("files");

    if (!channelId) {
      return NextResponse.json({ error: "channelId is required" }, { status: 400 });
    }

    // Verify channel ownership
    const channel = await db.channel.findFirst({
      where: { id: channelId, userId: user.id },
    });
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    // Ensure thumbnail directory exists
    const thumbDir = path.join(UPLOAD_DIR, "thumbnails", channelId);
    await fs.mkdir(thumbDir, { recursive: true });

    // Get the next sortOrder
    const maxOrder = await db.thumbnailItem.aggregate({
      where: { channelId },
      _max: { sortOrder: true },
    });
    let nextOrder = (maxOrder._max.sortOrder || 0) + 1;

    const created: any[] = [];
    for (const entry of files) {
      if (!(entry instanceof File)) continue;
      const file = entry as File;

      // Validate image extension
      const ext = path.extname(file.name).toLowerCase();
      if (!THUMBNAIL_EXTENSIONS.includes(ext)) {
        continue; // Skip non-image files
      }

      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const filePath = path.join(thumbDir, safeName);

      // Write file to disk
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      const record = await db.thumbnailItem.create({
        data: {
          userId: user.id,
          channelId,
          name: safeName,
          originalName: file.name,
          mimeType: file.type || "image/jpeg",
          size: file.size,
          storagePath: filePath,
          sortOrder: nextOrder++,
        },
      });
      created.push(record);
    }

    if (created.length === 0) {
      return NextResponse.json(
        { error: "No valid image files were uploaded" },
        { status: 400 }
      );
    }

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "success",
        category: "channel",
        message: `${created.length} thumbnail(s) added to ${channel.name}`,
      },
    });

    return NextResponse.json({ thumbnails: created });
  } catch (error: any) {
    console.error("Thumbnail upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
