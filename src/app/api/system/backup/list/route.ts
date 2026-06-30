// GET /api/system/backup/list — List all database backups
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listBackups } from "@/lib/backup";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
