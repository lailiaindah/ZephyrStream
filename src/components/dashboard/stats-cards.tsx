"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Cpu, MemoryStick, HardDrive, Wifi, Activity, Radio, Youtube, FolderOpen } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  accent?: "cyan" | "emerald" | "amber" | "rose" | "slate";
  progress?: number;
}

const accentClasses = {
  cyan: { bg: "bg-cyan-500/10", text: "text-cyan-300", bar: "bg-cyan-400", glow: "zephyr-glow" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-300", bar: "bg-emerald-400", glow: "zephyr-glow-emerald" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-300", bar: "bg-amber-400", glow: "" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-300", bar: "bg-rose-400", glow: "zephyr-glow-rose" },
  slate: { bg: "bg-slate-500/10", text: "text-slate-300", bar: "bg-slate-400", glow: "" },
};

export function StatCard({ title, value, subtitle, icon, accent = "cyan", progress }: StatCardProps) {
  const a = accentClasses[accent];
  return (
    <Card className={cn("relative overflow-hidden border-slate-800/60 bg-slate-900/40 backdrop-blur-sm zephyr-card-hover", a.glow)}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold text-white mt-1.5">{value}</p>
            {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
          </div>
          <div className={cn("flex items-center justify-center rounded-xl h-11 w-11 shrink-0", a.bg)}>
            {icon}
          </div>
        </div>
        {progress !== undefined && (
          <div className="mt-4 h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", a.bar)}
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

interface DashboardStatsProps {
  stats: {
    cpu: { usage: number; cores: number; brand: string; temperature: number | null };
    memory: { total: number; used: number; free: number; usage: number };
    disk: { total: number; used: number; usage: number; mount: string }[];
    network: { downloadSpeed: number; uploadSpeed: number; interface: string };
    uptime: number;
  } | null;
  counts: {
    channels: number;
    streams: number;
    files: number;
    liveStreams: number;
  };
}

export function DashboardStats({ stats, counts }: DashboardStatsProps) {
  const formatUptime = (sec: number) => {
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="CPU Usage"
        value={stats ? `${stats.cpu.usage.toFixed(1)}%` : "—"}
        subtitle={stats ? `${stats.cpu.cores} cores • ${stats.cpu.brand.slice(0, 30)}` : "Loading..."}
        icon={<Cpu className="h-5 w-5 text-cyan-300" />}
        accent={stats && stats.cpu.usage > 80 ? "rose" : "cyan"}
        progress={stats?.cpu.usage}
      />
      <StatCard
        title="Memory"
        value={stats ? `${stats.memory.usage.toFixed(1)}%` : "—"}
        subtitle={stats ? `${stats.memory.used.toFixed(1)} / ${stats.memory.total.toFixed(1)} GB` : "Loading..."}
        icon={<MemoryStick className="h-5 w-5 text-emerald-300" />}
        accent={stats && stats.memory.usage > 85 ? "rose" : "emerald"}
        progress={stats?.memory.usage}
      />
      <StatCard
        title="Disk"
        value={stats && stats.disk[0] ? `${stats.disk[0].usage.toFixed(1)}%` : "—"}
        subtitle={stats && stats.disk[0] ? `${stats.disk[0].used.toFixed(1)} / ${stats.disk[0].total.toFixed(1)} GB` : "Loading..."}
        icon={<HardDrive className="h-5 w-5 text-amber-300" />}
        accent={stats && stats.disk[0] && stats.disk[0].usage > 85 ? "rose" : "amber"}
        progress={stats?.disk[0]?.usage}
      />
      <StatCard
        title="Network"
        value={stats ? `${stats.network.downloadSpeed.toFixed(1)} Mbps` : "—"}
        subtitle={stats ? `↑ ${stats.network.uploadSpeed.toFixed(1)} • ${stats.network.interface}` : "Loading..."}
        icon={<Wifi className="h-5 w-5 text-rose-300" />}
        accent="rose"
      />

      <StatCard
        title="Active Channels"
        value={counts.channels}
        subtitle="YouTube accounts connected"
        icon={<Youtube className="h-5 w-5 text-cyan-300" />}
        accent="cyan"
      />
      <StatCard
        title="Live Streams"
        value={counts.liveStreams}
        subtitle={`of ${counts.streams} total`}
        icon={<Radio className="h-5 w-5 text-rose-300" />}
        accent={counts.liveStreams > 0 ? "rose" : "slate"}
      />
      <StatCard
        title="Uploaded Files"
        value={counts.files}
        subtitle="Available for streaming"
        icon={<FolderOpen className="h-5 w-5 text-emerald-300" />}
        accent="emerald"
      />
      <StatCard
        title="VPS Uptime"
        value={stats ? formatUptime(stats.uptime) : "—"}
        subtitle={stats ? `OS: ${stats.os?.distro?.slice(0, 20) || "Linux"}` : "Loading..."}
        icon={<Activity className="h-5 w-5 text-amber-300" />}
        accent="amber"
      />
    </div>
  );
}
