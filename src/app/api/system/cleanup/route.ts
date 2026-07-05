// POST /api/system/cleanup — Manually trigger file/DB cleanup
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runCleanupNow } from "@/lib/cleanup";
import { canAccessSystemEndpoints } from "@/lib/access-control";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await canAccessSystemEndpoints(user.role))) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    await runCleanupNow();

    return NextResponse.json({
      success: true,
      message: "Cleanup completed. Old stream logs, metrics, activity logs, and temp files pruned.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
