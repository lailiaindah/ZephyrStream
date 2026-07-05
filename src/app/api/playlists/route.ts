// GET /api/playlists — List user's playlists (optionally filtered by channelId)
// POST /api/playlists — Create a new playlist
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channelId");

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

    const playlists = await db.playlist.findMany({
      where,
      orderBy: { updatedAt: "desc" },
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

    // Attach a count + total size for convenience.
    // Use optional chaining for `it.file?.size` — if a file row was
    // hard-deleted while a PlaylistItem still references it (DB-level
    // inconsistency), `it.file` is null and the previous code would
    // throw TypeError, taking down the whole endpoint with a 500.
    const enriched = playlists.map((p) => ({
      ...p,
      itemCount: p.items.length,
      totalSize: p.items.reduce((sum, it) => sum + (it.file?.size ?? 0), 0),
    }));

    return NextResponse.json({ playlists: enriched });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, description, channelId, fileIds, shuffleOwn } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Playlist name is required" }, { status: 400 });
    }

    // Verify channel ownership if channelId provided
    let effectiveChannelId: string | null = null;
    if (channelId && channelId !== "unassigned") {
      const channel = await db.channel.findFirst({
        where: { id: channelId, userId: user.id },
      });
      if (!channel) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 });
      }
      effectiveChannelId = channelId;
    }

    // Validate that all fileIds belong to the user (and ideally to the same channel)
    const filesToConnect: string[] = [];
    if (Array.isArray(fileIds) && fileIds.length > 0) {
      const userFiles = await db.uploadedFile.findMany({
        where: {
          id: { in: fileIds },
          userId: user.id,
          // Files can be either unassigned or assigned to the same channel.
          // We don't reject cross-channel files to allow flexibility, but
          // they must belong to the user.
        },
        select: { id: true },
      });
      filesToConnect.push(...userFiles.map((f) => f.id));
    }

    // Create the playlist with its items in a single transaction
    const playlist = await db.playlist.create({
      data: {
        userId: user.id,
        channelId: effectiveChannelId,
        name: name.trim(),
        description: description?.trim() || null,
        shuffleOwn: typeof shuffleOwn === "boolean" ? shuffleOwn : null,
        items: filesToConnect.length
          ? {
              create: filesToConnect.map((fileId, idx) => ({
                fileId,
                sortOrder: idx,
              })),
            }
          : undefined,
      },
      include: {
        items: {
          orderBy: { sortOrder: "asc" },
          include: { file: { select: { id: true, originalName: true, size: true } } },
        },
      },
    });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "success",
        category: "file",
        message: `Created playlist "${playlist.name}" with ${filesToConnect.length} video(s)`,
      },
    });

    return NextResponse.json({ playlist });
  } catch (error: any) {
    console.error("Create playlist error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
