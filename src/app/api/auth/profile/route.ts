// PATCH /api/auth/profile — Update the current user's profile (name only).
// Email and role are not editable from the client.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name } = body;

    // Validate name — must be a non-empty string, max 100 chars
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "Name is too long (max 100 chars)" }, { status: 400 });
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: { name: name.trim() },
      select: { id: true, email: true, name: true, role: true },
    });

    return NextResponse.json({ user: updated });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
