// /api/titles/[id] — Update or delete a title
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const title = await db.titleItem.findFirst({
      where: { id, userId: user.id },
    });
    if (!title) return NextResponse.json({ error: "Title not found" }, { status: 404 });

    const body = await req.json();
    const { title: newTitle, emoji, enabled, sortOrder } = body;

    const updated = await db.titleItem.update({
      where: { id },
      data: {
        ...(newTitle !== undefined && { title: newTitle }),
        ...(emoji !== undefined && { emoji: emoji || null }),
        ...(enabled !== undefined && { enabled }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    return NextResponse.json({ title: updated });
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
    const title = await db.titleItem.findFirst({
      where: { id, userId: user.id },
    });
    if (!title) return NextResponse.json({ error: "Title not found" }, { status: 404 });

    await db.titleItem.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
