// File cleanup service — prunes old files to prevent disk space bloat.
//
// What gets cleaned:
// 1. Stream log files older than 7 days (logs/streams/*.log)
// 2. SystemMetric records older than 24 hours (DB)
// 3. ActivityLog records older than 30 days (DB)
// 4. Orphaned uploaded files (DB record exists but file missing on disk)
// 5. Temp files in /tmp matching zephystream-* pattern
//
// Runs as part of the scheduler tick (every 30 seconds is too frequent
// for cleanup, so we throttle to once per hour).

import { db } from "@/lib/db";
import fs from "fs/promises";
import path from "path";
import { STREAM_LOG_DIR } from "@/lib/constants";

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STREAM_LOG_RETENTION_DAYS = 7;
const METRIC_RETENTION_HOURS = 24;
const ACTIVITY_LOG_RETENTION_DAYS = 30;

let lastCleanupRun = 0;

// Main cleanup function — called from scheduler tick
export async function runCleanupIfNeeded() {
  const now = Date.now();
  if (now - lastCleanupRun < CLEANUP_INTERVAL_MS) return;

  lastCleanupRun = now;
  console.log("[Cleanup] Running scheduled cleanup...");

  try {
    await Promise.all([
      pruneStreamLogs(),
      pruneSystemMetrics(),
      pruneActivityLogs(),
      pruneTempFiles(),
    ]);
    console.log("[Cleanup] Done");
  } catch (err: any) {
    console.error("[Cleanup] Error:", err.message);
  }
}

// 1. Delete stream log files older than 7 days
async function pruneStreamLogs() {
  try {
    const cutoff = Date.now() - STREAM_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const entries = await fs.readdir(STREAM_LOG_DIR);

    let deleted = 0;
    for (const entry of entries) {
      if (entry === ".gitkeep") continue;
      if (!entry.endsWith(".log")) continue;

      const fullPath = path.join(STREAM_LOG_DIR, entry);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(fullPath);
          deleted++;
        }
      } catch {
        // File may have been deleted already
      }
    }

    if (deleted > 0) {
      console.log(`[Cleanup] Deleted ${deleted} old stream log file(s)`);
    }
  } catch (err: any) {
    // Directory may not exist yet
    if (!err.message.includes("ENOENT")) {
      console.warn("[Cleanup] Failed to prune stream logs:", err.message);
    }
  }
}

// 2. Delete SystemMetric records older than 24 hours
async function pruneSystemMetrics() {
  try {
    const cutoff = new Date(Date.now() - METRIC_RETENTION_HOURS * 60 * 60 * 1000);
    const result = await db.systemMetric.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      console.log(`[Cleanup] Deleted ${result.count} old system metric(s)`);
    }
  } catch (err: any) {
    console.warn("[Cleanup] Failed to prune system metrics:", err.message);
  }
}

// 3. Delete ActivityLog records older than 30 days
async function pruneActivityLogs() {
  try {
    const cutoff = new Date(Date.now() - ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await db.activityLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      console.log(`[Cleanup] Deleted ${result.count} old activity log(s)`);
    }
  } catch (err: any) {
    console.warn("[Cleanup] Failed to prune activity logs:", err.message);
  }
}

// 4. Delete temp files created by ZephyrStream in /tmp
async function pruneTempFiles() {
  try {
    const tmpDir = "/tmp";
    const entries = await fs.readdir(tmpDir);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours

    let deleted = 0;
    for (const entry of entries) {
      // Only delete files matching our pattern
      if (!entry.startsWith("zephystream-") && !entry.startsWith("zephyr-")) continue;

      const fullPath = path.join(tmpDir, entry);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(fullPath);
          deleted++;
        }
      } catch {
        // Skip if can't stat/delete
      }
    }

    if (deleted > 0) {
      console.log(`[Cleanup] Deleted ${deleted} temp file(s)`);
    }
  } catch (err: any) {
    console.warn("[Cleanup] Failed to prune temp files:", err.message);
  }
}

// Manual cleanup trigger (for API endpoint)
export async function runCleanupNow() {
  const oldLast = lastCleanupRun;
  lastCleanupRun = 0; // force run
  await runCleanupIfNeeded();
  lastCleanupRun = oldLast;
}
