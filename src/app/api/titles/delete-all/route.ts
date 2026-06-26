// DELETE /api/titles/delete-all — Delete all titles for a channel
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

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

    const result = await db.titleItem.deleteMany({
      where: { userId: user.id, channelId },
    });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "warn",
        category: "channel",
        message: `Deleted ${result.count} titles from ${channel.name}`,
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
