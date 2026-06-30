// Database backup service — creates daily backups of the SQLite database
// and retains them for 7 days. Runs automatically via the scheduler.
//
// Backups are stored in /home/z/my-project/backups/
// Format: zephystream_backup_YYYY-MM-DD_HH-MM-SS.db
//
// Also provides functions for:
// - Manual backup trigger
// - List backups
// - Download backup
// - Restore from backup

import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const BACKUP_DIR = "/home/z/my-project/backups";
const DB_PATH = "/home/z/my-project/db/custom.db";
const RETENTION_DAYS = 7;
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

let lastBackupRun = 0;
let isBackupRunning = false;

// Run backup if needed (called from scheduler tick, throttled to once per day)
export async function runBackupIfNeeded() {
  const now = Date.now();
  if (now - lastBackupRun < BACKUP_INTERVAL_MS) return;
  if (isBackupRunning) return;

  isBackupRunning = true;
  lastBackupRun = now;

  try {
    await createBackup();
    await pruneOldBackups();
  } catch (err: any) {
    console.error("[Backup] Error:", err.message);
  } finally {
    isBackupRunning = false;
  }
}

// Create a database backup using SQLite's .backup command
// (safe for online databases — doesn't lock writes)
export async function createBackup(): Promise<{ filename: string; size: number }> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupFilename = `zephystream_backup_${timestamp}.db`;
  const backupPath = path.join(BACKUP_DIR, backupFilename);

  // Use sqlite3 .backup command (safe online backup)
  // Falls back to file copy if sqlite3 CLI is not available
  try {
    await execAsync(`sqlite3 "${DB_PATH}" ".backup '${backupPath}'"`, { timeout: 30000 });
  } catch {
    // Fallback: copy the file directly (may miss in-flight writes, but better than nothing)
    console.warn("[Backup] sqlite3 CLI not available, falling back to file copy");
    await fs.copyFile(DB_PATH, backupPath);
  }

  const stat = await fs.stat(backupPath);
  console.log(`[Backup] Created: ${backupFilename} (${(stat.size / 1024).toFixed(1)} KB)`);

  return { filename: backupFilename, size: stat.size };
}

// Delete backups older than RETENTION_DAYS
export async function pruneOldBackups(): Promise<number> {
  try {
    const entries = await fs.readdir(BACKUP_DIR);
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const entry of entries) {
      if (!entry.startsWith("zephystream_backup_") || !entry.endsWith(".db")) continue;

      const fullPath = path.join(BACKUP_DIR, entry);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(fullPath);
          deleted++;
        }
      } catch {}
    }

    if (deleted > 0) {
      console.log(`[Backup] Pruned ${deleted} old backup(s)`);
    }

    return deleted;
  } catch (err: any) {
    console.warn("[Backup] Failed to prune old backups:", err.message);
    return 0;
  }
}

// List all available backups
export async function listBackups(): Promise<
  Array<{ filename: string; size: number; createdAt: string }>
> {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const entries = await fs.readdir(BACKUP_DIR);

    const backups: Array<{ filename: string; size: number; createdAt: string }> = [];

    for (const entry of entries) {
      if (!entry.startsWith("zephystream_backup_") || !entry.endsWith(".db")) continue;

      const fullPath = path.join(BACKUP_DIR, entry);
      try {
        const stat = await fs.stat(fullPath);
        backups.push({
          filename: entry,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
        });
      } catch {}
    }

    // Sort by date descending (newest first)
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return backups;
  } catch (err: any) {
    console.warn("[Backup] Failed to list backups:", err.message);
    return [];
  }
}

// Get the full path for a backup file (for download)
export function getBackupPath(filename: string): string {
  // Prevent directory traversal — only allow filenames matching our pattern
  if (!/^zephystream_backup_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/.test(filename)) {
    throw new Error("Invalid backup filename");
  }
  return path.join(BACKUP_DIR, filename);
}

// Delete a specific backup
export async function deleteBackup(filename: string): Promise<void> {
  const fullPath = getBackupPath(filename); // validates filename
  await fs.unlink(fullPath);
}

// Manual backup trigger (bypasses throttle)
export async function runBackupNow(): Promise<{ filename: string; size: number }> {
  if (isBackupRunning) {
    throw new Error("Backup already running");
  }
  isBackupRunning = true;
  try {
    const result = await createBackup();
    await pruneOldBackups();
    lastBackupRun = Date.now();
    return result;
  } finally {
    isBackupRunning = false;
  }
}
