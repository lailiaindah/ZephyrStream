// POST /api/playlists/[id]/items — Add a file to a playlist (append at end)
// Body: { fileId: string }  OR  { fileIds: string[] } to add multiple at once
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const playlist = await db.playlist.findFirst({
      where: { id, userId: user.id },
      include: {
        items: { orderBy: { sortOrder: "desc" }, take: 1 },
      },
    });
    if (!playlist) {
      return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
    }

    const body = await req.json();
    const fileIds: string[] = Array.isArray(body.fileIds)
      ? body.fileIds
      : body.fileId
      ? [body.fileId]
      : [];

    if (fileIds.length === 0) {
      return NextResponse.json({ error: "fileId(s) required" }, { status: 400 });
    }

    // Validate file ownership
    const userFiles = await db.uploadedFile.findMany({
      where: { id: { in: fileIds }, userId: user.id },
      select: { id: true },
    });
    const validFileIds = new Set(userFiles.map((f) => f.id));

    // Determine the starting sortOrder (continue from the highest existing)
    let nextSort = (playlist.items[0]?.sortOrder ?? -1) + 1;

    // Wrap inserts in a transaction so concurrent appends don't collide
    // on the same starting sortOrder. Each request computes its own
    // starting sortOrder based on the snapshot at the start of the
    // transaction; the database serializes the transactions.
    const createdItems: any[] = [];
    await db.$transaction(async (tx) => {
      // Re-fetch the current max sortOrder inside the transaction to
      // get the most up-to-date value (another concurrent request may
      // have just inserted items).
      const latest = await tx.playlistItem.findFirst({
        where: { playlistId: id },
        orderBy: { sortOrder: "desc" },
        take: 1,
      });
      let sortIdx = (latest?.sortOrder ?? -1) + 1;

      for (const fid of fileIds) {
        if (!validFileIds.has(fid)) continue;
        const item = await tx.playlistItem.create({
          data: { playlistId: id, fileId: fid, sortOrder: sortIdx++ },
        });
        createdItems.push(item);
      }
      nextSort = sortIdx;
    });

    return NextResponse.json({ added: createdItems.length, items: createdItems });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
