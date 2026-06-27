// POST /api/system/backup/create — Manually trigger a database backup
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runBackupNow } from "@/lib/backup";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await runBackupNow();

    return NextResponse.json({
      success: true,
      filename: result.filename,
      size: result.size,
      sizeKB: Math.round((result.size / 1024) * 10) / 10,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
