// GET /api/system/backup/list — List all database backups
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listBackups } from "@/lib/backup";
import { canAccessSystemEndpoints } from "@/lib/access-control";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Consistent with create/delete backup endpoints — require admin
    // in multi-user mode.
    if (!(await canAccessSystemEndpoints(user.role))) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const backups = await listBackups();

    return NextResponse.json({
      backups,
      count: backups.length,
      retentionDays: 7,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
