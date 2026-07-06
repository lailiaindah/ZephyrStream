// /api/playlists/[id] — Get, update, or delete a playlist
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const playlist = await db.playlist.findFirst({
      where: { id, userId: user.id },
      include: {
        channel: { select: { id: true, name: true } },
        items: {
          orderBy: { sortOrder: "asc" },
          include: {
            file: {
              select: {
                id: true,
                originalName: true,
                size: true,
                mimeType: true,
                storagePath: true,
              },
            },
          },
        },
      },
    });

    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    return NextResponse.json({ playlist });
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
    const playlist = await db.playlist.findFirst({
      where: { id, userId: user.id },
    });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const body = await req.json();
    const { name, description, channelId, fileIds, shuffleOwn } = body;

    // Verify channel ownership if changing channelId
    let newChannelId: string | null = playlist.channelId;
    if (channelId !== undefined) {
      if (channelId && channelId !== "unassigned") {
        const channel = await db.channel.findFirst({
          where: { id: channelId, userId: user.id },
        });
        if (!channel) {
          return NextResponse.json({ error: "Channel not found" }, { status: 404 });
        }
        newChannelId = channelId;
      } else if (channelId === "unassigned") {
        newChannelId = null;
      } else {
        newChannelId = null;
      }
    }

    // Update basic fields. Use String() coercion for name and description
    // so a non-string truthy value (e.g. 123) doesn't throw on .trim().
    const updateData: any = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return NextResponse.json({ error: "Playlist name cannot be empty" }, { status: 400 });
      }
      updateData.name = trimmed;
    }
    if (description !== undefined) {
      const trimmed = String(description).trim();
      updateData.description = trimmed || null;
    }
    if (channelId !== undefined) updateData.channelId = newChannelId;
    if (shuffleOwn !== undefined) {
      updateData.shuffleOwn = typeof shuffleOwn === "boolean" ? shuffleOwn : null;
    }

    // If fileIds is provided, replace the entire playlist contents.
    // We use a transaction to delete existing items and insert new ones
    // with sequential sortOrder values.
    if (Array.isArray(fileIds)) {
      // Validate that all fileIds belong to the user
      const userFiles = await db.uploadedFile.findMany({
        where: { id: { in: fileIds }, userId: user.id },
        select: { id: true },
      });
      const validFileIds = userFiles.map((f) => f.id);
      const orderedFileIds = fileIds.filter((fid: string) => validFileIds.includes(fid));

      await db.$transaction([
        db.playlistItem.deleteMany({ where: { playlistId: id } }),
        ...orderedFileIds.map((fileId: string, idx: number) =>
          db.playlistItem.create({
            data: { playlistId: id, fileId, sortOrder: idx },
          })
        ),
      ]);
    }

    const updated = await db.playlist.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { file: { select: { id: true, originalName: true, size: true } } },
        },
      },
    });

    return NextResponse.json({ playlist: updated });
  } catch (error: any) {
    console.error("Update playlist error:", error);
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
    const playlist = await db.playlist.findFirst({
      where: { id, userId: user.id },
    });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    await db.playlist.delete({ where: { id } });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "warn",
        category: "file",
        message: `Deleted playlist "${playlist.name}"`,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
