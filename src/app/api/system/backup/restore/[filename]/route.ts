// POST /api/system/backup/restore/[filename] — Restore database from a backup file
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBackupPath } from "@/lib/backup";
import { canAccessSystemEndpoints } from "@/lib/access-control";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";

const execFileAsync = promisify(execFile);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await canAccessSystemEndpoints(user.role))) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { filename } = await params;

    let backupPath: string;
    try {
      backupPath = getBackupPath(filename);
    } catch {
      return NextResponse.json({ error: "Invalid backup filename" }, { status: 400 });
    }

    try {
      await fs.access(backupPath);
    } catch {
      return NextResponse.json({ error: "Backup file not found" }, { status: 404 });
    }

    // Determine the current DB path
    const DB_PATH = process.env.DATABASE_URL?.replace("file:", "") || "db/custom.db";

    // Create a pre-restore backup (safety net)
    const preRestoreBackup = `${DB_PATH}.pre-restore-${Date.now()}`;
    try {
      await fs.copyFile(DB_PATH, preRestoreBackup);
    } catch {}

    // Restore: copy the backup file over the current DB
    try {
      // Try sqlite3 .restore first (safe for online DB)
      await execFileAsync("sqlite3", [DB_PATH, `.restore '${backupPath}'`], { timeout: 30000 });
    } catch {
      // Fallback: direct file copy (may miss in-flight writes)
      await fs.copyFile(backupPath, DB_PATH);
    }

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "warn",
        category: "system",
        message: `Database restored from: ${filename}`,
        details: `Pre-restore backup saved at ${preRestoreBackup}. Server restart recommended.`,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Database restored successfully. Please restart the server to apply changes.",
      preRestoreBackup,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Need db import for activity log
import { db } from "@/lib/db";
