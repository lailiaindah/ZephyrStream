"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { User, Shield, Server, Cpu, Save, Loader2, CheckCircle2, Download, RefreshCw, GitBranch, AlertCircle, Database, Plus, Trash2 } from "lucide-react";
import { APP_VERSION } from "@/lib/constants";

export function SettingsView({ user }: { user: any }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.name || "");
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

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

  // Check for updates
  const checkUpdateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/system/update?action=check", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data.upToDate) {
        toast.success("You are running the latest version");
      } else {
        toast.info(`${data.newCommits?.length || 0} new update(s) available`);
        setUpdateDialogOpen(true);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Pull updates
  const pullUpdateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/system/update?action=pull", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message, { duration: 8000 });
      if (data.stepsCompleted) {
        toast.info(`Steps: ${data.stepsCompleted.join(" → ")}`, { duration: 10000 });
      }
      setUpdateDialogOpen(false);
      // Reload page after 3 seconds to load new version
      setTimeout(() => window.location.reload(), 3000);
    },
    onError: (err: Error) => toast.error(err.message, { duration: 8000 }),
  });

  // Fetch backups
  const { data: backups, refetch: refetchBackups } = useQuery({
    queryKey: ["backups"],
    queryFn: async () => {
      const res = await fetch("/api/system/backup/list");
      const data = await res.json();
      return data.backups as any[];
    },
  });

  // Create backup
  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/system/backup/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Backup created successfully");
      refetchBackups();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete backup
  const deleteBackupMutation = useMutation({
    mutationFn: async (filename: string) => {
      const res = await fetch(`/api/system/backup/delete/${filename}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
    },
    onSuccess: () => {
      toast.success("Backup deleted");
      refetchBackups();
    },
    onError: (err: Error) => toast.error(err.message),
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

      {/* Update checker */}
      <Card className="border-slate-800/60 bg-slate-900/40">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch className="h-4 w-4 text-emerald-300" />
            <h3 className="text-sm font-semibold text-white">App Updates</h3>
            <Badge variant="outline" className="ml-auto border-cyan-500/40 text-cyan-300 text-[10px]">
              v{APP_VERSION}
              {checkUpdateMutation.data?.currentCommit && ` · ${checkUpdateMutation.data.currentCommit}`}
            </Badge>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Check for updates from the GitHub repository. If a new version is available,
              you can pull it directly from here (works like <code className="text-cyan-300">git pull</code>).
            </p>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => checkUpdateMutation.mutate()}
                disabled={checkUpdateMutation.isPending}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950"
              >
                {checkUpdateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Cek Update
              </Button>
              <a
                href="https://github.com/lailiaindah/ZephyrStream"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-400 hover:text-cyan-300 underline"
              >
                github.com/lailiaindah/ZephyrStream
              </a>
            </div>
            {checkUpdateMutation.data && !checkUpdateMutation.data.upToDate && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-amber-300" />
                  <span className="text-sm font-medium text-amber-300">
                    {checkUpdateMutation.data.message}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setUpdateDialogOpen(true)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  Lihat &amp; Install Update
                </Button>
              </div>
            )}
            {checkUpdateMutation.data?.upToDate && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                <span className="text-sm text-emerald-300">{checkUpdateMutation.data.message}</span>
              </div>
            )}
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

      {/* Database Backups */}
      <Card className="border-slate-800/60 bg-slate-900/40">
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-cyan-300" />
              <h3 className="text-sm font-semibold text-white">Database Backups</h3>
            </div>
            <Button
              size="sm"
              onClick={() => createBackupMutation.mutate()}
              disabled={createBackupMutation.isPending}
              className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950"
            >
              {createBackupMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1" />
              )}
              Create Backup
            </Button>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Daily automatic backups (7-day retention). You can also create manual backups and download them.
          </p>
          <ScrollArea className="max-h-60">
            {!backups || backups.length === 0 ? (
              <div className="text-center py-4">
                <Database className="h-6 w-6 text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No backups yet</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {backups.map((backup: any) => (
                  <div
                    key={backup.filename}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/60"
                  >
                    <Database className="h-4 w-4 text-cyan-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-slate-200 truncate">{backup.filename}</p>
                      <p className="text-[10px] text-slate-500">
                        {(backup.size / 1024).toFixed(1)} KB · {new Date(backup.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <a
                      href={`/api/system/backup/download/${backup.filename}`}
                      className="text-slate-400 hover:text-cyan-300 p-1"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => {
                        if (confirm(`Delete backup ${backup.filename}?`)) {
                          deleteBackupMutation.mutate(backup.filename);
                        }
                      }}
                      className="text-slate-400 hover:text-rose-300 p-1"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </Card>

      {/* About */}
      <Card className="border-slate-800/60 bg-slate-900/40">
        <div className="p-5">
          <h3 className="text-sm font-semibold text-white mb-3">About ZephyrStream</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            ZephyrStream is a self-hosted multi-channel YouTube live streaming platform with automatic scheduling.
            Each channel uses its own Google Cloud Console credentials (clientId + clientSecret) to create live broadcasts in YouTube Studio,
            while the actual video streaming uses the YouTube stream key via FFmpeg — saving valuable Google API quota.
            The scheduler auto-starts streams at their scheduled time and can auto-create next-day schedules.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-slate-400">
              Version {APP_VERSION}
              {checkUpdateMutation.data?.currentCommit && (
                <span className="text-slate-500 ml-1">
                  (commit {checkUpdateMutation.data.currentCommit})
                </span>
              )}
            </span>
          </div>
        </div>
      </Card>

      {/* Update dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-emerald-300" />
              Update Available
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {checkUpdateMutation.data?.newCommits?.length || 0} new commit(s) from GitHub
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-48 rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="space-y-1 font-mono text-xs">
              {checkUpdateMutation.data?.newCommits?.map((commit: string, idx: number) => (
                <div key={idx} className="text-slate-300 py-0.5">{commit}</div>
              ))}
            </div>
          </ScrollArea>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
            <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
            After pulling, you may need to run <code className="text-amber-200">bun install</code> and{" "}
            <code className="text-amber-200">bun run db:push</code> if dependencies or schema changed,
            then restart the server.
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setUpdateDialogOpen(false)}>
              Nanti
            </Button>
            <Button
              onClick={() => pullUpdateMutation.mutate()}
              disabled={pullUpdateMutation.isPending}
              className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950"
            >
              {pullUpdateMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Pull &amp; Install
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
