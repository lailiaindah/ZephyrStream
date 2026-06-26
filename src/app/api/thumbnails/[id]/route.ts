// /api/thumbnails/[id] — Update or delete a thumbnail
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs/promises";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const thumb = await db.thumbnailItem.findFirst({
      where: { id, userId: user.id },
    });
    if (!thumb) return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });

    // Serve the image file
    try {
      const buffer = await fs.readFile(thumb.storagePath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": thumb.mimeType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
    }
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
    const thumb = await db.thumbnailItem.findFirst({
      where: { id, userId: user.id },
    });
    if (!thumb) return NextResponse.json({ error: "Thumbnail not found" }, { status: 404 });

    // Delete the physical file
    if (thumb.storagePath) {
      try {
        await fs.unlink(thumb.storagePath);
      } catch {}
    }

    await db.thumbnailItem.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
