"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Wifi,
  Activity,
  Radio,
  Youtube,
  FolderOpen,
  Clock,
  Server,
} from "lucide-react";

interface DashboardStatsProps {
  stats: {
    cpu: { usage: number; cores: number; brand: string; manufacturer: string; temperature: number | null };
    memory: { total: number; used: number; free: number; usage: number };
    disk: { total: number; used: number; free: number; usage: number; mount: string; fs: string }[];
    network: { downloadSpeed: number; uploadSpeed: number; interface: string; totalRx: number; totalTx: number };
    uptime: number;
    os: { platform: string; distro: string; release: string; kernel: string; hostname: string };
  } | null;
  counts: {
    channels: number;
    streams: number;
    files: number;
    liveStreams: number;
  };
}

type StatKey = "cpu" | "memory" | "disk" | "network" | "uptime" | "channels" | "streams" | "files";

interface IconTileProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: "cyan" | "emerald" | "amber" | "rose" | "slate";
  progress?: number;
  pulse?: boolean;
  onClick?: () => void;
}

const accentClasses = {
  cyan: { bg: "bg-cyan-500/10", text: "text-cyan-300", bar: "bg-cyan-400", border: "border-cyan-500/30" },
  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-300", bar: "bg-emerald-400", border: "border-emerald-500/30" },
  amber: { bg: "bg-amber-500/10", text: "text-amber-300", bar: "bg-amber-400", border: "border-amber-500/30" },
  rose: { bg: "bg-rose-500/10", text: "text-rose-300", bar: "bg-rose-400", border: "border-rose-500/30" },
  slate: { bg: "bg-slate-500/10", text: "text-slate-300", bar: "bg-slate-400", border: "border-slate-600/40" },
};

function IconTile({ icon, label, value, accent, progress, pulse, onClick }: IconTileProps) {
  const a = accentClasses[accent];
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-slate-900/40 p-3 transition-all hover:bg-slate-800/60 hover:border-slate-600",
        a.border,
        onClick && "cursor-pointer"
      )}
    >
      <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg", a.bg)}>
        {icon}
      </div>
      <div className="text-center min-w-0 w-full">
        <p className="text-sm font-bold text-white truncate">{value}</p>
        <p className="text-[10px] text-slate-500 uppercase tracking-wide truncate">{label}</p>
      </div>
      {progress !== undefined && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-800/60 rounded-b-xl overflow-hidden">
          <div
            className={cn("h-full transition-all duration-700", a.bar)}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      {pulse && (
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-red-500 zephyr-pulse-dot" />
      )}
    </button>
  );
}

export function DashboardStats({ stats, counts }: DashboardStatsProps) {
  const [detailOpen, setDetailOpen] = useState<StatKey | null>(null);

  const formatUptime = (sec: number) => {
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        <IconTile
          icon={<Cpu className="h-4 w-4 text-cyan-300" />}
          label="CPU"
          value={stats ? `${stats.cpu.usage.toFixed(0)}%` : "—"}
          accent={stats && stats.cpu.usage > 80 ? "rose" : "cyan"}
          progress={stats?.cpu.usage}
          onClick={() => setDetailOpen("cpu")}
        />
        <IconTile
          icon={<MemoryStick className="h-4 w-4 text-emerald-300" />}
          label="RAM"
          value={stats ? `${stats.memory.usage.toFixed(0)}%` : "—"}
          accent={stats && stats.memory.usage > 85 ? "rose" : "emerald"}
          progress={stats?.memory.usage}
          onClick={() => setDetailOpen("memory")}
        />
        <IconTile
          icon={<HardDrive className="h-4 w-4 text-amber-300" />}
          label="Disk"
          value={stats && stats.disk[0] ? `${stats.disk[0].usage.toFixed(0)}%` : "—"}
          accent={stats && stats.disk[0] && stats.disk[0].usage > 85 ? "rose" : "amber"}
          progress={stats?.disk[0]?.usage}
          onClick={() => setDetailOpen("disk")}
        />
        <IconTile
          icon={<Wifi className="h-4 w-4 text-rose-300" />}
          label="Net"
          value={stats ? `${stats.network.downloadSpeed.toFixed(0)}` : "—"}
          accent="rose"
          onClick={() => setDetailOpen("network")}
        />
        <IconTile
          icon={<Youtube className="h-4 w-4 text-cyan-300" />}
          label="Channels"
          value={counts.channels}
          accent="cyan"
          onClick={() => setDetailOpen("channels")}
        />
        <IconTile
          icon={<Radio className="h-4 w-4 text-rose-300" />}
          label="Live"
          value={counts.liveStreams}
          accent={counts.liveStreams > 0 ? "rose" : "slate"}
          pulse={counts.liveStreams > 0}
          onClick={() => setDetailOpen("streams")}
        />
        <IconTile
          icon={<FolderOpen className="h-4 w-4 text-emerald-300" />}
          label="Files"
          value={counts.files}
          accent="emerald"
          onClick={() => setDetailOpen("files")}
        />
        <IconTile
          icon={<Activity className="h-4 w-4 text-amber-300" />}
          label="Uptime"
          value={stats ? formatUptime(stats.uptime) : "—"}
          accent="amber"
          onClick={() => setDetailOpen("uptime")}
        />
      </div>

      {/* Detail modal */}
      <Dialog open={!!detailOpen} onOpenChange={(o) => !o && setDetailOpen(null)}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailOpen === "cpu" && <><Cpu className="h-5 w-5 text-cyan-300" /> CPU Details</>}
              {detailOpen === "memory" && <><MemoryStick className="h-5 w-5 text-emerald-300" /> Memory Details</>}
              {detailOpen === "disk" && <><HardDrive className="h-5 w-5 text-amber-300" /> Disk Details</>}
              {detailOpen === "network" && <><Wifi className="h-5 w-5 text-rose-300" /> Network Details</>}
              {detailOpen === "uptime" && <><Activity className="h-5 w-5 text-amber-300" /> System Info</>}
              {detailOpen === "channels" && <><Youtube className="h-5 w-5 text-cyan-300" /> Channels Overview</>}
              {detailOpen === "streams" && <><Radio className="h-5 w-5 text-rose-300" /> Streams Overview</>}
              {detailOpen === "files" && <><FolderOpen className="h-5 w-5 text-emerald-300" /> Files Overview</>}
            </DialogTitle>
          </DialogHeader>

          {!stats && detailOpen !== "channels" && detailOpen !== "streams" && detailOpen !== "files" ? (
            <p className="text-sm text-slate-400">Loading system information…</p>
          ) : (
            <div className="space-y-2 text-sm">
              {detailOpen === "cpu" && stats && (
                <>
                  <Row label="Usage" value={`${stats.cpu.usage.toFixed(2)}%`} />
                  <Row label="Cores" value={stats.cpu.cores} />
                  <Row label="Manufacturer" value={stats.cpu.manufacturer} />
                  <Row label="Brand" value={stats.cpu.brand} />
                  <Row label="Temperature" value={stats.cpu.temperature !== null ? `${stats.cpu.temperature}°C` : "N/A"} />
                </>
              )}
              {detailOpen === "memory" && stats && (
                <>
                  <Row label="Usage" value={`${stats.memory.usage.toFixed(2)}%`} />
                  <Row label="Used" value={`${stats.memory.used.toFixed(2)} GB`} />
                  <Row label="Free" value={`${stats.memory.free.toFixed(2)} GB`} />
                  <Row label="Total" value={`${stats.memory.total.toFixed(2)} GB`} />
                </>
              )}
              {detailOpen === "disk" && stats && (
                <>
                  {stats.disk.map((d, i) => (
                    <div key={i} className="rounded-lg border border-slate-800 p-2.5">
                      <Row label="Mount" value={d.mount} />
                      <Row label="Filesystem" value={d.fs} />
                      <Row label="Usage" value={`${d.usage.toFixed(1)}%`} />
                      <Row label="Used / Total" value={`${d.used.toFixed(1)} / ${d.total.toFixed(1)} GB`} />
                      <Row label="Free" value={`${d.free.toFixed(1)} GB`} />
                    </div>
                  ))}
                </>
              )}
              {detailOpen === "network" && stats && (
                <>
                  <Row label="Interface" value={stats.network.interface} />
                  <Row label="Download" value={`${stats.network.downloadSpeed.toFixed(2)} Mbps`} />
                  <Row label="Upload" value={`${stats.network.uploadSpeed.toFixed(2)} Mbps`} />
                  <Row label="Total Downloaded" value={`${stats.network.totalRx.toFixed(2)} GB`} />
                  <Row label="Total Uploaded" value={`${stats.network.totalTx.toFixed(2)} GB`} />
                </>
              )}
              {detailOpen === "uptime" && stats && (
                <>
                  <Row label="Uptime" value={formatUptime(stats.uptime)} />
                  <Row label="Hostname" value={stats.os.hostname} />
                  <Row label="OS" value={`${stats.os.distro} ${stats.os.release}`} />
                  <Row label="Kernel" value={stats.os.kernel} />
                  <Row label="Platform" value={stats.os.platform} />
                </>
              )}
              {detailOpen === "channels" && (
                <>
                  <Row label="Total channels" value={counts.channels} />
                  <p className="text-xs text-slate-400 pt-2">
                    Click the &quot;Channels&quot; tab in the sidebar to manage your YouTube channels,
                    their titles, thumbnails and video files.
                  </p>
                </>
              )}
              {detailOpen === "streams" && (
                <>
                  <Row label="Live now" value={counts.liveStreams} />
                  <Row label="Total streams" value={counts.streams} />
                  <p className="text-xs text-slate-400 pt-2">
                    Click the &quot;Streams&quot; tab in the sidebar to view and manage streams per channel.
                  </p>
                </>
              )}
              {detailOpen === "files" && (
                <>
                  <Row label="Total files" value={counts.files} />
                  <p className="text-xs text-slate-400 pt-2">
                    Click the &quot;Files&quot; tab in the sidebar to upload and manage video files per channel.
                  </p>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-200 font-medium text-right">{value}</span>
    </div>
  );
}
