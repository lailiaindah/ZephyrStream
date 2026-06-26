// DELETE /api/thumbnails/delete-all — Delete all thumbnails for a channel
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");

    if (!channelId) {
      return NextResponse.json(
        { error: "channelId is required" },
        { status: 400 }
      );
    }

    // Verify channel ownership
    const channel = await db.channel.findFirst({
      where: { id: channelId, userId: user.id },
    });
    if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

    const thumbnails = await db.thumbnailItem.findMany({
      where: { userId: user.id, channelId },
    });

    // Delete physical files
    for (const t of thumbnails) {
      if (t.storagePath) {
        try {
          await fs.unlink(t.storagePath);
        } catch {}
      }
    }

    const result = await db.thumbnailItem.deleteMany({
      where: { userId: user.id, channelId },
    });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "warn",
        category: "channel",
        message: `Deleted ${result.count} thumbnails from ${channel.name}`,
      },
    });

    return NextResponse.json({
      success: true,
      deleted: result.count,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
