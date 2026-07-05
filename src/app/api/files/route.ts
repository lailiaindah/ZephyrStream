// GET /api/files — List user's uploaded files (filtered by channelId if provided)
// DELETE /api/files — Delete a single file (by id) OR all files for a channel
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";

/**
 * Remove a deleted file's ID from any stream's sourceFileIds JSON array.
 * Without this, streams that referenced the deleted file would silently
 * stream fewer videos than the user configured (or fail with "No video
 * files found" if all referenced files are deleted).
 *
 * We also remove it from any PlaylistItem rows so playlists don't show
 * "ghost" entries.
 */
async function cleanupFileReferences(fileId: string, userId: string) {
  // Find all streams owned by this user that have a sourceFileIds JSON
  // containing the deleted fileId. We can't filter inside JSON in Prisma
  // (SQLite doesn't support JSON path queries), so we fetch all streams
  // for the user and filter in JS — fine for typical deployments.
  const streams = await db.stream.findMany({
    where: { userId, sourceFileIds: { not: null } },
    select: { id: true, sourceFileIds: true },
  });

  for (const s of streams) {
    if (!s.sourceFileIds) continue;
    try {
      const ids: string[] = JSON.parse(s.sourceFileIds);
      if (ids.includes(fileId)) {
        const newIds = ids.filter((id) => id !== fileId);
        await db.stream.update({
          where: { id: s.id },
          data: {
            sourceFileIds: newIds.length > 0 ? JSON.stringify(newIds) : null,
          },
        });
      }
    } catch {
      // Malformed JSON — leave it alone
    }
  }

  // Also remove the file from any PlaylistItem rows that reference it.
  // The schema has onDelete: Cascade on PlaylistItem.file, so Prisma
  // already deletes the items — but only if the FK is enforced. On
  // SQLite with Prisma, this depends on referential integrity being
  // enabled. We do it explicitly to be safe.
  await db.playlistItem.deleteMany({
    where: { fileId },
  }).catch(() => {});
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");

    // If channelId provided, verify ownership
    if (channelId && channelId !== "unassigned") {
      const channel = await db.channel.findFirst({
        where: { id: channelId, userId: user.id },
      });
      if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const where = {
      userId: user.id,
      ...(channelId === "unassigned"
        ? { channelId: null }
        : channelId
        ? { channelId }
        : {}),
    };

    const files = await db.uploadedFile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { channel: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ files });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get("id");
    const channelId = searchParams.get("channelId");
    const all = searchParams.get("all");

    // Delete ALL files for a channel (or all user's files)
    if (all === "true") {
      const where = {
        userId: user.id,
        ...(channelId && channelId !== "unassigned"
          ? { channelId }
          : channelId === "unassigned"
          ? { channelId: null }
          : {}),
      };

      // Verify channel ownership if channelId provided
      if (channelId && channelId !== "unassigned") {
        const channel = await db.channel.findFirst({
          where: { id: channelId, userId: user.id },
        });
        if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
      }

      const files = await db.uploadedFile.findMany({ where });

      // Delete physical files
      for (const f of files) {
        if (f.storagePath) {
          try {
            await fs.unlink(f.storagePath);
          } catch {}
        }
      }

      const result = await db.uploadedFile.deleteMany({ where });

      // Clean up references to the deleted files in streams' sourceFileIds
      // and in PlaylistItem rows.
      for (const f of files) {
        await cleanupFileReferences(f.id, user.id);
      }

      await db.activityLog.create({
        data: {
          userId: user.id,
          level: "warn",
          category: "file",
          message: `Deleted ${result.count} file(s)`,
        },
      });

      return NextResponse.json({
        success: true,
        deleted: result.count,
      });
    }

    // Delete a single file
    if (!fileId) {
      return NextResponse.json({ error: "File ID is required" }, { status: 400 });
    }

    const file = await db.uploadedFile.findFirst({
      where: { id: fileId, userId: user.id },
    });
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

    // Delete the physical file
    if (file.storagePath) {
      try {
        await fs.unlink(file.storagePath);
      } catch {}
    }

    await db.uploadedFile.delete({ where: { id: fileId } });

    // Clean up references to this file in streams' sourceFileIds JSON
    // arrays and in PlaylistItem rows. Without this, streams would
    // silently stream fewer videos (or fail to start) after a file delete.
    await cleanupFileReferences(fileId, user.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
