"use client";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/common/logo";
import {
  LayoutDashboard,
  Radio,
  Youtube,
  FolderOpen,
  Activity,
  Settings,
  LogOut,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type ViewKey =
  | "dashboard"
  | "channels"
  | "streams"
  | "files"
  | "activity"
  | "settings";

interface SidebarProps {
  current: ViewKey;
  onNavigate: (view: ViewKey) => void;
  onLogout: () => void;
  liveCount: number;
  channelCount: number;
}

const navItems: { key: ViewKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "channels", label: "Channels", icon: Youtube },
  { key: "streams", label: "Streams", icon: Radio },
  { key: "files", label: "Files", icon: FolderOpen },
  { key: "activity", label: "Activity", icon: Activity },
  { key: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ current, onNavigate, onLogout, liveCount, channelCount }: SidebarProps) {
  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-800/60 bg-slate-950/40 backdrop-blur-xl">
      <div className="p-5 border-b border-slate-800/60">
        <Logo size="md" />
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-gradient-to-r from-cyan-500/15 to-emerald-500/10 text-cyan-300 border border-cyan-500/30 zephyr-glow"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border border-transparent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.key === "streams" && liveCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-1.5 py-0.5">
                  <span className="h-1 w-1 rounded-full bg-red-500 zephyr-pulse-dot" />
                  {liveCount}
                </span>
              )}
              {item.key === "channels" && channelCount > 0 && (
                <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-full px-1.5 py-0.5">
                  {channelCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* VPS status indicator */}
      <div className="px-4 py-3 border-t border-slate-800/60">
        <div className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Server className="h-3.5 w-3.5" />
            <span>VPS Status</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 zephyr-pulse-dot" />
            <span className="text-xs font-medium text-emerald-300">Online</span>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-slate-800/60">
        <Button
          variant="ghost"
          onClick={onLogout}
          className="w-full justify-start text-slate-400 hover:text-rose-300 hover:bg-rose-500/10"
        >
          <LogOut className="h-4 w-4 mr-3" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
