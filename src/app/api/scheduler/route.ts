// POST /api/scheduler/start — Start the in-memory scheduler (idempotent)
// GET  /api/scheduler — Get scheduler status
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { startScheduler } from "@/lib/scheduler";
import { canAccessSystemEndpoints } from "@/lib/access-control";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await canAccessSystemEndpoints(user.role))) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // startScheduler is idempotent — safe to call multiple times
    startScheduler();

    return NextResponse.json({ success: true, message: "Scheduler is running" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    return NextResponse.json({ running: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
