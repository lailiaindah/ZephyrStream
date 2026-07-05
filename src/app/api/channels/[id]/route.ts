// /api/channels/[id] — Get, update, or delete a specific channel
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";
import path from "path";
import { UPLOAD_DIR } from "@/lib/constants";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const channel = await db.channel.findFirst({
      where: { id, userId: user.id },
      include: {
        streams: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        // Include counts for all related entities so this endpoint can be
        // used as a "channel status" check (e.g. visiting /api/channels/[id]
        // in a browser shows stream/file/title/thumbnail/playlist counts).
        _count: {
          select: {
            streams: true,
            files: true,
            titles: true,
            thumbnails: true,
            playlists: true,
          },
        },
      },
    });

    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    return NextResponse.json({ channel });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { name, description, clientId, clientSecret, status } = body;

    const channel = await db.channel.findFirst({
      where: { id, userId: user.id },
    });
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const updated = await db.channel.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(clientId !== undefined && { clientId }),
        ...(clientSecret !== undefined && { clientSecret }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json({ channel: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
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

    // Before deleting the channel row (which cascades to files, titles,
    // thumbnails, playlists, streams), collect the physical file paths
    // so we can delete them from disk too. Otherwise disk fills up with
    // orphaned files belonging to deleted channels.
    const [filesToDelete, thumbnailsToDelete] = await Promise.all([
      db.uploadedFile.findMany({
        where: { channelId: id },
        select: { storagePath: true },
      }),
      db.thumbnailItem.findMany({
        where: { channelId: id },
        select: { storagePath: true },
      }),
    ]);

    const physicalPaths = [
      ...filesToDelete.map((f) => f.storagePath),
      ...thumbnailsToDelete.map((t) => t.storagePath),
    ].filter(Boolean) as string[];

    // Delete the channel row (cascades to all related DB rows)
    await db.channel.delete({ where: { id } });

    // Best-effort cleanup of physical files. Use Promise.allSettled so
    // one failure doesn't fail the whole delete — the DB rows are already
    // gone, and a leftover file is just disk waste (not a correctness bug).
    if (physicalPaths.length > 0) {
      await Promise.allSettled(physicalPaths.map((p) => fs.unlink(p)));
    }

    // Also remove the per-channel upload directory if it exists
    const channelUploadDir = path.join(UPLOAD_DIR, "channels", id);
    const thumbUploadDir = path.join(UPLOAD_DIR, "thumbnails", id);
    await Promise.allSettled([
      fs.rm(channelUploadDir, { recursive: true, force: true }),
      fs.rm(thumbUploadDir, { recursive: true, force: true }),
    ]);

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "warn",
        category: "channel",
        message: `Channel deleted: ${channel.name}`,
        details: `Cleaned up ${physicalPaths.length} physical file(s)`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
