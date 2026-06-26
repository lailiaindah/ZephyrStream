"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { User, Shield, Server, Cpu, Save, Loader2, CheckCircle2 } from "lucide-react";

export function SettingsView({ user }: { user: any }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.name || "");

  const { data: ffmpegInfo } = useQuery({
    queryKey: ["ffmpeg"],
    queryFn: async () => {
      const res = await fetch("/api/system/ffmpeg");
      return res.json();
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["system-stats"],
    queryFn: async () => {
      const res = await fetch("/api/system/stats");
      return res.json();
    },
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-white">Settings</h2>
        <p className="text-sm text-slate-400">Manage your account and view system information</p>
      </div>

      {/* Profile */}
      <Card className="border-slate-800/60 bg-slate-900/40">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <User className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-semibold text-white">Profile</h3>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-slate-200">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-200">Email</Label>
              <Input
                value={user?.email || ""}
                disabled
                className="bg-slate-900/50 border-slate-800 text-slate-400"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-200">Role</Label>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 capitalize">
                  <Shield className="h-3 w-3 mr-1" />
                  {user?.role || "user"}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* FFmpeg info */}
      <Card className="border-slate-800/60 bg-slate-900/40">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="h-4 w-4 text-emerald-300" />
            <h3 className="text-sm font-semibold text-white">FFmpeg Installation</h3>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
              <span className="text-slate-400">Binary path</span>
              <code className="text-xs text-cyan-300 font-mono">{ffmpegInfo?.ffmpegPath || "..."}</code>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
              <span className="text-slate-400">FFprobe path</span>
              <code className="text-xs text-cyan-300 font-mono">{ffmpegInfo?.ffprobePath || "..."}</code>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-slate-400">Version</span>
              <span className="text-xs text-slate-300">{ffmpegInfo?.version || "..."}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* VPS info */}
      <Card className="border-slate-800/60 bg-slate-900/40">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Server className="h-4 w-4 text-amber-300" />
            <h3 className="text-sm font-semibold text-white">VPS Information</h3>
          </div>
          {stats?.stats ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Hostname</span>
                <span className="text-slate-300">{stats.stats.os.hostname}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">OS</span>
                <span className="text-slate-300">{stats.stats.os.distro} {stats.stats.os.release}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">Kernel</span>
                <span className="text-slate-300">{stats.stats.os.kernel}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-800/60">
                <span className="text-slate-400">CPU</span>
                <span className="text-slate-300 text-xs">{stats.stats.cpu.manufacturer} {stats.stats.cpu.brand}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-400">Cores</span>
                <span className="text-slate-300">{stats.stats.cpu.cores}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-xs text-slate-500">Loading...</div>
          )}
        </div>
      </Card>

      {/* About */}
      <Card className="border-slate-800/60 bg-slate-900/40">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-white mb-3">About ZephyrStream</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            ZephyrStream is a self-hosted multi-channel YouTube live streaming platform. Each channel uses its own Google Cloud Console credentials (clientId + clientSecret) to create live broadcasts in YouTube Studio, while the actual video streaming uses the YouTube stream key via FFmpeg — saving valuable Google API quota.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-slate-400">Version 1.0.0</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
