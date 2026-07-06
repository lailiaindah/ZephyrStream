// System threshold alerts — checks disk, RAM, FFmpeg log folder, and upload
// folder sizes. Creates activity log entries + returns alert data for the
// dashboard. Called from the scheduler tick (every 30s).

import { db } from "@/lib/db";
import fs from "fs/promises";
import path from "path";
import { UPLOAD_DIR, STREAM_LOG_DIR } from "@/lib/constants";

export interface SystemAlert {
  level: "warn" | "error";
  category: string;
  message: string;
  details?: string;
  value: number;
  threshold: number;
  unit: string;
}

// Thresholds
const DISK_WARNING_PCT = 85;
const DISK_CRITICAL_PCT = 92;
const RAM_WARNING_PCT = 85;
const RAM_CRITICAL_PCT = 92;
const LOG_DIR_WARNING_MB = 500;
const LOG_DIR_CRITICAL_MB = 1000;
const UPLOAD_DIR_WARNING_PCT = 80; // % of total disk
const UPLOAD_DIR_CRITICAL_MB = 50000; // 50GB

// Track which alerts have been fired to avoid spamming (reset on server restart)
const firedAlerts = new Set<string>();

async function getDirSizeMB(dirPath: string): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let totalBytes = 0;
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalBytes += await getDirSizeMB(fullPath);
      } else {
        try {
          const stat = await fs.stat(fullPath);
          totalBytes += stat.size;
        } catch {}
      }
    }
    return totalBytes / (1024 * 1024); // MB
  } catch {
    return 0;
  }
}

export async function checkSystemThresholds(): Promise<SystemAlert[]> {
  const alerts: SystemAlert[] = [];

  try {
    // === DISK USAGE ===
    const si = await import("systeminformation");
    const disks = await si.fsSize();
    for (const disk of disks.slice(0, 3)) {
      const pct = disk.use || 0;
      if (pct >= DISK_CRITICAL_PCT) {
        const key = `disk-critical-${disk.fs}`;
        if (!firedAlerts.has(key)) {
          firedAlerts.add(key);
          alerts.push({
            level: "error",
            category: "system",
            message: `Disk ${disk.fs} is ${pct.toFixed(1)}% full (critical)`,
            details: `Mount: ${disk.mount}, Total: ${(disk.size / 1e9).toFixed(1)}GB, Used: ${(disk.used / 1e9).toFixed(1)}GB`,
            value: pct,
            threshold: DISK_CRITICAL_PCT,
            unit: "%",
          });
        }
      } else if (pct >= DISK_WARNING_PCT) {
        const key = `disk-warning-${disk.fs}`;
        if (!firedAlerts.has(key)) {
          firedAlerts.add(key);
          alerts.push({
            level: "warn",
            category: "system",
            message: `Disk ${disk.fs} is ${pct.toFixed(1)}% full (warning)`,
            details: `Mount: ${disk.mount}, Total: ${(disk.size / 1e9).toFixed(1)}GB, Used: ${(disk.used / 1e9).toFixed(1)}GB`,
            value: pct,
            threshold: DISK_WARNING_PCT,
            unit: "%",
          });
        }
      } else {
        // Clear fired alert when back to normal
        firedAlerts.delete(`disk-warning-${disk.fs}`);
        firedAlerts.delete(`disk-critical-${disk.fs}`);
      }
    }

    // === RAM USAGE ===
    const mem = await si.mem();
    const ramPct = (mem.used / mem.total) * 100;
    if (ramPct >= RAM_CRITICAL_PCT) {
      const key = "ram-critical";
      if (!firedAlerts.has(key)) {
        firedAlerts.add(key);
        alerts.push({
          level: "error",
          category: "system",
          message: `RAM usage is ${ramPct.toFixed(1)}% (critical)`,
          details: `Total: ${(mem.total / 1e9).toFixed(1)}GB, Used: ${(mem.used / 1e9).toFixed(1)}GB`,
          value: ramPct,
          threshold: RAM_CRITICAL_PCT,
          unit: "%",
        });
      }
    } else if (ramPct >= RAM_WARNING_PCT) {
      const key = "ram-warning";
      if (!firedAlerts.has(key)) {
        firedAlerts.add(key);
        alerts.push({
          level: "warn",
          category: "system",
          message: `RAM usage is ${ramPct.toFixed(1)}% (warning)`,
          details: `Total: ${(mem.total / 1e9).toFixed(1)}GB, Used: ${(mem.used / 1e9).toFixed(1)}GB`,
          value: ramPct,
          threshold: RAM_WARNING_PCT,
          unit: "%",
        });
      }
    } else {
      firedAlerts.delete("ram-warning");
      firedAlerts.delete("ram-critical");
    }

    // === FFmpeg LOG FOLDER SIZE ===
    const logSizeMB = await getDirSizeMB(STREAM_LOG_DIR);
    if (logSizeMB >= LOG_DIR_CRITICAL_MB) {
      const key = "log-critical";
      if (!firedAlerts.has(key)) {
        firedAlerts.add(key);
        alerts.push({
          level: "error",
          category: "system",
          message: `FFmpeg log folder is ${logSizeMB.toFixed(0)}MB (critical, >${LOG_DIR_CRITICAL_MB}MB)`,
          details: `Path: ${STREAM_LOG_DIR}. Run cleanup or delete old log files manually.`,
          value: logSizeMB,
          threshold: LOG_DIR_CRITICAL_MB,
          unit: "MB",
        });
      }
    } else if (logSizeMB >= LOG_DIR_WARNING_MB) {
      const key = "log-warning";
      if (!firedAlerts.has(key)) {
        firedAlerts.add(key);
        alerts.push({
          level: "warn",
          category: "system",
          message: `FFmpeg log folder is ${logSizeMB.toFixed(0)}MB (warning, >${LOG_DIR_WARNING_MB}MB)`,
          details: `Path: ${STREAM_LOG_DIR}`,
          value: logSizeMB,
          threshold: LOG_DIR_WARNING_MB,
          unit: "MB",
        });
      }
    } else {
      firedAlerts.delete("log-warning");
      firedAlerts.delete("log-critical");
    }

    // === UPLOAD FOLDER SIZE ===
    const uploadSizeMB = await getDirSizeMB(UPLOAD_DIR);
    if (uploadSizeMB >= UPLOAD_DIR_CRITICAL_MB) {
      const key = "upload-critical";
      if (!firedAlerts.has(key)) {
        firedAlerts.add(key);
        alerts.push({
          level: "error",
          category: "system",
          message: `Upload folder is ${(uploadSizeMB / 1024).toFixed(1)}GB (critical, >${UPLOAD_DIR_CRITICAL_MB / 1024}GB)`,
          details: `Path: ${UPLOAD_DIR}. Delete unused video files to free disk space.`,
          value: uploadSizeMB,
          threshold: UPLOAD_DIR_CRITICAL_MB,
          unit: "MB",
        });
      }
    } else {
      firedAlerts.delete("upload-critical");
    }
  } catch (err: any) {
    console.error("[ThresholdAlerts] Error:", err.message);
  }

  // Log alerts to activity log
  for (const alert of alerts) {
    try {
      await db.activityLog.create({
        data: {
          level: alert.level,
          category: alert.category,
          message: alert.message,
          details: alert.details,
        },
      });
    } catch {}
  }

  return alerts;
}
