// POST /api/auth/signout — Clear session
import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (user) {
      await db.activityLog.create({
        data: {
          userId: user.id,
          level: "info",
          category: "auth",
          message: `User signed out: ${user.email}`,
        },
      });
    }
    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
