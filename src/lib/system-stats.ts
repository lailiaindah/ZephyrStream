// VPS system monitoring library — uses systeminformation to gather metrics

import si from "systeminformation";
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
  const [cpuLoad, cpuInfo, cpuTemp, mem, disk, netInterfaces, osInfo, time] = await Promise.all([
    si.currentLoad(),
    si.cpu(),
    si.cpuTemperature().catch(() => null),
    si.mem(),
    si.fsSize(),
    si.networkInterfaces(),
    si.osInfo(),
    si.time(),
  ]);

  // Pick the default network interface
  const defaultInterface =
    netInterfaces.find((n) => n.default) || netInterfaces[0] || null;

  // Network speed: compute delta from last call
  let downloadSpeed = 0;
  let uploadSpeed = 0;
  if (defaultInterface) {
    const currentRx = defaultInterface.stats?.rx || 0;
    const currentTx = defaultInterface.stats?.tx || 0;
    const now = Date.now();
    if (lastNetworkStats && lastNetworkStats.time < now) {
      const timeDeltaSec = (now - lastNetworkStats.time) / 1000;
      const rxDeltaBytes = currentRx - lastNetworkStats.rx;
      const txDeltaBytes = currentTx - lastNetworkStats.tx;
      // Convert bytes/sec to Mbps
      downloadSpeed = Math.max(0, (rxDeltaBytes * 8) / (timeDeltaSec * 1_000_000));
      uploadSpeed = Math.max(0, (txDeltaBytes * 8) / (timeDeltaSec * 1_000_000));
    }
    lastNetworkStats = { rx: currentRx, tx: currentTx, time: now };
  }

  const totalMemGB = mem.total / 1_073_741_824;
  const usedMemGB = mem.used / 1_073_741_824;
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
      loadAvg: [
        osInfo.platform === "linux" ? (cpuLoad.avgLoad || 0) : 0,
        0,
        0,
      ],
    },
    memory: {
      total: totalMemGB,
      used: usedMemGB,
      free: freeMemGB,
      usage: (mem.used / mem.total) * 100,
    },
    disk: disks,
    network: {
      downloadSpeed,
      uploadSpeed,
      interface: defaultInterface?.iface || "unknown",
      totalRx: (defaultInterface?.stats?.rx || 0) / 1_073_741_824,
      totalTx: (defaultInterface?.stats?.tx || 0) / 1_073_741_824,
    },
    uptime: osInfo.uptime || 0,
    os: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      kernel: osInfo.kernel,
      hostname: osInfo.hostname,
    },
    load: {
      current: cpuLoad.currentLoad || 0,
      average1: cpuLoad.avgLoad || 0,
      average5: 0,
      average15: 0,
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
        loadAvg5: 0,
        loadAvg15: 0,
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

// Run an internet speed test (downloads a known file and measures time)
export async function runInternetSpeedTest(): Promise<{
  downloadSpeed: number; // Mbps
  latencyMs: number;
}> {
  const startTime = Date.now();
  try {
    // Use Cloudflare's speed test endpoint (small file)
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
      latencyMs: Math.round(elapsedSec * 1000),
    };
  } catch (error) {
    return { downloadSpeed: 0, latencyMs: 0 };
  }
}
