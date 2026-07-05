// DELETE /api/playlists/[id]/items/[itemId] — Remove a specific item from a playlist
// PATCH  /api/playlists/[id]/items/[itemId] — Reorder an item (body: { sortOrder: number })
//                                       OR move it before/after another item (body: { beforeId, afterId })
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, itemId } = await params;

    // Verify playlist ownership
    const playlist = await db.playlist.findFirst({
      where: { id, userId: user.id },
    });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    await db.playlistItem.deleteMany({ where: { id: itemId, playlistId: id } });

    // Re-index sortOrder so it stays sequential after deletion
    const remaining = await db.playlistItem.findMany({
      where: { playlistId: id },
      orderBy: { sortOrder: "asc" },
    });
    await db.$transaction(
      remaining.map((item, idx) =>
        db.playlistItem.update({ where: { id: item.id }, data: { sortOrder: idx } })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, itemId } = await params;
    const playlist = await db.playlist.findFirst({
      where: { id, userId: user.id },
    });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const body = await req.json();
    const newSort = typeof body.sortOrder === "number" ? body.sortOrder : null;

    if (newSort === null) {
      return NextResponse.json({ error: "sortOrder required in body" }, { status: 400 });
    }

    // Update the item's sortOrder, then re-index all items in the playlist
    // so they remain sequential (0..n-1).
    await db.playlistItem.update({
      where: { id: itemId },
      data: { sortOrder: newSort },
    });

    const all = await db.playlistItem.findMany({
      where: { playlistId: id },
      orderBy: { sortOrder: "asc" },
    });
    await db.$transaction(
      all.map((item, idx) =>
        db.playlistItem.update({ where: { id: item.id }, data: { sortOrder: idx } })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
