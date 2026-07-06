// VPS system monitoring library — uses systeminformation to gather metrics

import si from "systeminformation";
import os from "os";
import { db } from "@/lib/db";

export interface SystemStats {
  cpu: {
    usage: number;
    cores: number;
    manufacturer: string;
    brand: string;
    temperature: number | null;
    loadAvg: [number, number, number];
  };
  memory: {
    total: number; // GB
    used: number; // GB
    free: number; // GB
    usage: number; // %
  };
  disk: {
    total: number; // GB
    used: number; // GB
    free: number; // GB
    usage: number; // %
    fs: string;
    mount: string;
  }[];
  network: {
    downloadSpeed: number; // Mbps
    uploadSpeed: number; // Mbps
    interface: string;
    totalRx: number; // GB
    totalTx: number; // GB
  };
  uptime: number; // seconds
  os: {
    platform: string;
    distro: string;
    release: string;
    kernel: string;
    hostname: string;
  };
  load: {
    current: number;
    average1: number;
    average5: number;
    average15: number;
  };
  timestamp: string;
}

// Cache the previous network stats to compute speed deltas
let lastNetworkStats: { rx: number; tx: number; time: number } | null = null;

// Get current system statistics
export async function getSystemStats(): Promise<SystemStats> {
  const [cpuLoad, cpuInfo, cpuTemp, mem, disk, netInterfaces, netStats, osInfo, time] = await Promise.all([
    si.currentLoad(),
    si.cpu(),
    si.cpuTemperature().catch(() => null),
    si.mem(),
    si.fsSize(),
    si.networkInterfaces(),
    si.networkStats().catch(() => [] as any[]),
    si.osInfo(),
    si.time(),
  ]);

  // Get load average from Node's os module (not available via systeminformation)
  // Returns [1min, 5min, 15min] averages
  const loadAvg = os.loadavg();

  // Pick the default network interface
  const defaultInterface =
    netInterfaces.find((n) => n.default) || netInterfaces[0] || null;

  // Network speed: compute delta from last call.
  // si.networkInterfaces() doesn't include rx/tx stats — we must use
  // si.networkStats() which returns real-time throughput per interface.
  let downloadSpeed = 0;
  let uploadSpeed = 0;
  let totalRx = 0;
  let totalTx = 0;
  let netIfaceName = "unknown";

  if (defaultInterface) {
    netIfaceName = defaultInterface.iface || "unknown";
    // Find the matching stats entry for the default interface
    const ifaceStats = (netStats as any[]).find(
      (s) => s.iface === defaultInterface.iface
    ) || (netStats as any[])[0];

    if (ifaceStats) {
      // systeminformation v5 uses rx_bytes / tx_bytes (not rx / tx)
      totalRx = ifaceStats.rx_bytes || 0;
      totalTx = ifaceStats.tx_bytes || 0;
      const now = Date.now();
      if (lastNetworkStats && lastNetworkStats.time < now) {
        const timeDeltaSec = (now - lastNetworkStats.time) / 1000;
        const rxDeltaBytes = totalRx - lastNetworkStats.rx;
        const txDeltaBytes = totalTx - lastNetworkStats.tx;
        // Convert bytes/sec to Mbps
        downloadSpeed = Math.max(0, (rxDeltaBytes * 8) / (timeDeltaSec * 1_000_000));
        uploadSpeed = Math.max(0, (txDeltaBytes * 8) / (timeDeltaSec * 1_000_000));
      }
      lastNetworkStats = { rx: totalRx, tx: totalTx, time: now };
    }
  }

  const totalMemGB = mem.total / 1_073_741_824;
  // Use 'active' memory (actual used by applications) instead of 'used'
  // (which includes buff/cache). This gives a more accurate picture of
  // how much RAM the apps are really consuming.
  // Fall back to 'used' if 'active' is not available (older systeminformation versions).
  const activeMemBytes = (mem as any).active || mem.used;
  const usedMemGB = activeMemBytes / 1_073_741_824;
  const freeMemGB = mem.free / 1_073_741_824;

  const disks = disk.slice(0, 5).map((d) => ({
    total: d.size / 1_073_741_824,
    used: d.used / 1_073_741_824,
    free: (d.size - d.used) / 1_073_741_824,
    usage: d.use,
    fs: d.fs,
    mount: d.mount,
  }));

  return {
    cpu: {
      usage: cpuLoad.currentLoad || 0,
      cores: cpuInfo.cores,
      manufacturer: cpuInfo.manufacturer,
      brand: cpuInfo.brand,
      temperature: cpuTemp?.main ?? null,
      // Load average from os.loadavg() — [1min, 5min, 15min]
      loadAvg: loadAvg as [number, number, number],
    },
    memory: {
      total: totalMemGB,
      used: usedMemGB,
      free: freeMemGB,
      usage: (activeMemBytes / mem.total) * 100,
    },
    disk: disks,
    network: {
      downloadSpeed,
      uploadSpeed,
      interface: netIfaceName,
      totalRx: totalRx / 1_073_741_824,
      totalTx: totalTx / 1_073_741_824,
    },
    uptime: time.uptime || 0,
    os: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      kernel: osInfo.kernel,
      hostname: osInfo.hostname,
    },
    load: {
      current: cpuLoad.currentLoad || 0,
      average1: loadAvg[0] || 0,
      average5: loadAvg[1] || 0,
      average15: loadAvg[2] || 0,
    },
    timestamp: new Date().toISOString(),
  };
}

// Persist the latest stats to the database (for historical charts)
export async function recordSystemStats() {
  try {
    const stats = await getSystemStats();
    await db.systemMetric.create({
      data: {
        cpuUsage: stats.cpu.usage,
        cpuCores: stats.cpu.cores,
        cpuTemp: stats.cpu.temperature ?? 0,
        ramTotal: stats.memory.total,
        ramUsed: stats.memory.used,
        ramUsage: stats.memory.usage,
        diskTotal: stats.disk[0]?.total ?? 0,
        diskUsed: stats.disk[0]?.used ?? 0,
        diskUsage: stats.disk[0]?.usage ?? 0,
        netDownload: stats.network.downloadSpeed,
        netUpload: stats.network.uploadSpeed,
        uptime: stats.uptime,
        loadAvg1: stats.load.average1,
        loadAvg5: stats.load.average5,
        loadAvg15: stats.load.average15,
      },
    });

    // Prune old metrics older than 24 hours
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.systemMetric.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    return stats;
  } catch (error) {
    console.error("Failed to record system stats:", error);
    return null;
  }
}

// Get historical metrics for charts (last N minutes)
export async function getHistoricalStats(minutes: number = 60) {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const metrics = await db.systemMetric.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  return metrics;
}

// Run an internet speed test using the official Ookla Speedtest CLI.
//
// The Ookla CLI is more accurate than a single-file download because it:
//   - Uses multiple parallel connections
//   - Measures both download AND upload
//   - Reports jitter, packet loss, and latency
//   - Selects the nearest server automatically
//   - Reports the server used and the ISP
//
// Installation (one-time, on the VPS):
//   # Option A: official Ookla apt repo (Debian/Ubuntu)
//   sudo apt-get install gnupg1 apt-transport-https
//   sudo install -d -m 0755 /etc/apt/keyrings
//   sudo gpg --no-default-keyring --keyring /etc/apt/keyrings/ookla_speedtest-cli-archive-keyring.gpg \
//     --keyserver keyserver.ubuntu.com --recv-keys 379CE192D401AB61
//   echo "deb [signed-by=/etc/apt/keyrings/ookla_speedtest-cli-archive-keyring.gpg] https://debian.speedtest.net/ookla-speedtest-cli $(lsb_release -cs) main" | \
//     sudo tee /etc/apt/sources.list.d/ookla_speedtest-cli.list
//   sudo apt-get update && sudo apt-get install speedtest
//
//   # Option B: download the standalone binary (no sudo)
//   curl -sL https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-x86_64.tgz | tar xz -C /usr/local/bin speedtest
//
// The CLI is auto-detected from PATH, or you can override with the
// SPEEDTEST_BIN env var. If not found, we fall back to the legacy
// Cloudflare-based test so the UI still works.
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface OoklaSpeedTestResult {
  // Download/upload speeds in Mbps (rounded to 2 decimals)
  downloadSpeed: number;
  uploadSpeed: number;
  // Latency / jitter in milliseconds
  latencyMs: number;
  jitterMs: number;
  packetLoss: number; // percentage (0-100)
  // Server + ISP info so the user can verify the test ran against a real server
  server: {
    id: number;
    name: string;
    location: string;
    country: string;
    host: string;
  };
  isp: string;
  externalIp: string;
  internalIp: string;
  // URL of the result page on speedtest.net (so user can verify/share)
  resultUrl: string;
  // Whether the Ookla CLI was used (false = fell back to legacy test)
  usedOokla: boolean;
  // Raw timestamps for diagnostics
  timestamp: string;
}

// Find the Ookla speedtest binary. Returns null if not found.
async function findSpeedtestBinary(): Promise<string | null> {
  // 1. Explicit env var override (highest priority)
  if (process.env.SPEEDTEST_BIN) {
    try {
      await execFileAsync(process.env.SPEEDTEST_BIN, ["--version"], { timeout: 5000 });
      return process.env.SPEEDTEST_BIN;
    } catch {
      // fall through
    }
  }

  // 2. Common install locations (in order of preference)
  const candidates = [
    "speedtest",                              // in PATH (apt install)
    "/usr/local/bin/speedtest",               // manual install
    "/usr/bin/speedtest",                     // apt install
    "/home/z/bin/speedtest",                  // our dev env
    "/opt/speedtest",                         // some installs
  ];

  for (const bin of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, ["--version"], { timeout: 5000 });
      // Verify it's the Ookla CLI (not the legacy python `speedtest-cli`)
      if (stdout.includes("Speedtest by Ookla")) {
        return bin;
      }
    } catch {
      // not found or wrong binary
    }
  }

  return null;
}

// Legacy fallback: download a 10MB file from Cloudflare and measure throughput.
// Less accurate than Ookla (single connection, no upload test, no jitter).
async function runLegacySpeedTest(): Promise<OoklaSpeedTestResult> {
  const startTime = Date.now();
  try {
    const response = await fetch("https://speed.cloudflare.com/__down?bytes=10000000", {
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Speed test endpoint unreachable");
    const buffer = await response.arrayBuffer();
    const elapsedSec = (Date.now() - startTime) / 1000;
    const bits = buffer.byteLength * 8;
    const downloadSpeed = bits / elapsedSec / 1_000_000;
    return {
      downloadSpeed: Math.round(downloadSpeed * 100) / 100,
      uploadSpeed: 0,
      latencyMs: Math.round(elapsedSec * 1000),
      jitterMs: 0,
      packetLoss: 0,
      server: {
        id: 0,
        name: "Cloudflare",
        location: "Anycast",
        country: "",
        host: "speed.cloudflare.com",
      },
      isp: "",
      externalIp: "",
      internalIp: "",
      resultUrl: "",
      usedOokla: false,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      downloadSpeed: 0,
      uploadSpeed: 0,
      latencyMs: 0,
      jitterMs: 0,
      packetLoss: 0,
      server: { id: 0, name: "", location: "", country: "", host: "" },
      isp: "",
      externalIp: "",
      internalIp: "",
      resultUrl: "",
      usedOokla: false,
      timestamp: new Date().toISOString(),
    };
  }
}

// Run the Ookla Speedtest CLI and parse the JSON output.
// The CLI can take 15-30 seconds to complete (download + upload phases).
// We set a 120s timeout to be safe.
export async function runInternetSpeedTest(): Promise<OoklaSpeedTestResult> {
  const bin = await findSpeedtestBinary();
  if (!bin) {
    console.warn("[SpeedTest] Ookla speedtest CLI not found, falling back to legacy Cloudflare test. Install from https://www.speedtest.net/apps/cli");
    return runLegacySpeedTest();
  }

  try {
    // Run with JSON output, no progress bar, accept license + GDPR
    // (the CLI requires accepting these on first run; we pass the flags
    // to avoid the interactive prompt that would hang the request).
    const { stdout } = await execFileAsync(
      bin,
      ["--format=json", "--progress=no", "--accept-license", "--accept-gdpr"],
      { timeout: 120_000 }
    );

    const data = JSON.parse(stdout);

    // Ookla reports bandwidth in bytes/second. Convert to Mbps (bits/second / 1e6).
    // The CLI's JSON format uses "bandwidth" in B/s, "bytes" total transferred,
    // and "elapsed" in milliseconds.
    const downloadBps = (data.download?.bandwidth || 0) * 8;
    const uploadBps = (data.upload?.bandwidth || 0) * 8;

    return {
      downloadSpeed: Math.round((downloadBps / 1_000_000) * 100) / 100,
      uploadSpeed: Math.round((uploadBps / 1_000_000) * 100) / 100,
      latencyMs: Math.round((data.ping?.latency || 0) * 100) / 100,
      jitterMs: Math.round((data.ping?.jitter || 0) * 100) / 100,
      packetLoss: Math.round((data.packetLoss || 0) * 10000) / 100, // 0-100%
      server: {
        id: data.server?.id || 0,
        name: data.server?.name || "",
        location: data.server?.location || "",
        country: data.server?.country || "",
        host: data.server?.host || "",
      },
      isp: data.isp || "",
      externalIp: data.interface?.externalIp || "",
      internalIp: data.interface?.internalIp || "",
      resultUrl: data.result?.url || "",
      usedOokla: true,
      timestamp: data.timestamp || new Date().toISOString(),
    };
  } catch (err: any) {
    console.error("[SpeedTest] Ookla CLI failed:", err.message);
    // Fall back to legacy test so the UI doesn't break
    const fallback = await runLegacySpeedTest();
    fallback.server.name = `${fallback.server.name} (Ookla failed: ${err.message})`;
    return fallback;
  }
}
