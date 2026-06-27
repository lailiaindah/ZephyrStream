"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AuthForm } from "@/components/auth/auth-form";
import { Sidebar, type ViewKey } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Header } from "@/components/layout/header";
import { DashboardStats } from "@/components/dashboard/stats-cards";
import { MetricChart } from "@/components/dashboard/metric-chart";
import { SpeedTestPanel } from "@/components/dashboard/speed-test-panel";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { ChannelList } from "@/components/channels/channel-list";
import { StreamList } from "@/components/streams/stream-list";
import { FileManager } from "@/components/files/file-manager";
import { SettingsView } from "@/components/dashboard/settings-view";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Radio, RefreshCw, Plus, Server, Wifi, WifiOff } from "lucide-react";
import { useRealtimeUpdates } from "@/hooks/use-realtime";

export default function Home() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewKey>("dashboard");
  const { connected: realtimeConnected } = useRealtimeUpdates();

  // Check current user on mount
  const { data: authData, isLoading: authLoading } = useQuery({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      return res.json();
    },
  });

  // Derive user directly from query data
  const user = authData?.user ?? null;
  const authChecked = !authLoading && authData !== undefined;

  // Dashboard data
  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard");
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 10000,
  });

  // System stats
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["system-stats"],
    queryFn: async () => {
      const res = await fetch("/api/system/stats");
      return res.json();
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      // Immediately update the cache so the auth form shows without waiting for refetch
      queryClient.setQueryData(["auth-me"], { user: null });
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      toast.success("Signed out");
    } catch {
      toast.error("Failed to sign out");
    }
  };

  // Loading state
  if (!authChecked || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 rounded-full border-4 border-slate-800 border-t-cyan-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading ZephyrStream...</p>
        </div>
      </div>
    );
  }

  // Not authenticated — show auth form
  if (!user) {
    return <AuthForm onAuthSuccess={(userData) => {
      // Immediately update the cache so the dashboard shows without a refetch flash
      queryClient.setQueryData(["auth-me"], { user: userData });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    }} />;
  }

  // Authenticated — show main app
  const liveCount = dashboardData?.counts?.liveStreams || 0;
  const channelCount = dashboardData?.counts?.channels || 0;

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar
        current={view}
        onNavigate={setView}
        onLogout={handleLogout}
        liveCount={liveCount}
        channelCount={channelCount}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <MobileNav
          current={view}
          onNavigate={setView}
          onLogout={handleLogout}
          liveCount={liveCount}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">
          {view === "dashboard" && (
            <div className="space-y-5">
              <Header
                user={user}
                title="Dashboard"
                subtitle="Monitor your VPS and live streams in real-time"
                onNavigate={setView}
                onLogout={handleLogout}
                actions={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchStats()}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    Refresh
                  </Button>
                }
              />

              <DashboardStats
                stats={statsData?.stats || null}
                counts={dashboardData?.counts || { channels: 0, streams: 0, files: 0, liveStreams: 0 }}
              />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <MetricChart
                      title="CPU Usage"
                      data={(statsData?.history || []).map((m: any) => ({
                        time: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        value: m.cpuUsage,
                      }))}
                      color="#22d3ee"
                    />
                    <MetricChart
                      title="Memory Usage"
                      data={(statsData?.history || []).map((m: any) => ({
                        time: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                        value: m.ramUsage,
                      }))}
                      color="#34d399"
                    />
                  </div>

                  {/* Live streams panel */}
                  <Card className="border-slate-800/60 bg-slate-900/40">
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Radio className="h-4 w-4 text-rose-300" />
                          <h3 className="text-sm font-semibold text-white">Live Now</h3>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setView("streams")}
                          className="border-slate-700 text-slate-300 hover:bg-slate-800"
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          New Stream
                        </Button>
                      </div>
                      {!dashboardData?.liveStreams || dashboardData.liveStreams.length === 0 ? (
                        <div className="text-center py-8">
                          <Radio className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                          <p className="text-xs text-slate-500">No streams currently live</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dashboardData.liveStreams.map((s: any) => (
                            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-950/50 border border-slate-800/60">
                              <span className="h-2 w-2 rounded-full bg-red-500 zephyr-pulse-dot" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white truncate">{s.name}</p>
                                <p className="text-xs text-slate-500">
                                  {s.channel?.name || "No channel"} • started {s.startedAt ? new Date(s.startedAt).toLocaleTimeString() : ""}
                                </p>
                              </div>
                              <span className="text-xs text-red-300 font-mono">PID: {s.pid}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                <div className="space-y-5">
                  <SpeedTestPanel />
                  <ActivityFeed logs={dashboardData?.recentLogs || []} />
                </div>
              </div>

              {/* Recent streams */}
              <Card className="border-slate-800/60 bg-slate-900/40">
                <div className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">Recent Streams</h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setView("streams")}
                      className="text-slate-400 hover:text-slate-100"
                    >
                      View all →
                    </Button>
                  </div>
                  {!dashboardData?.recentStreams || dashboardData.recentStreams.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-xs text-slate-500">No streams created yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dashboardData.recentStreams.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-950/40 border border-slate-800/60">
                          <div className="flex items-center gap-3 min-w-0">
                            <Radio className={`h-4 w-4 ${s.status === "live" ? "text-red-400" : "text-slate-500"}`} />
                            <div className="min-w-0">
                              <p className="text-sm text-white truncate">{s.name}</p>
                              <p className="text-[10px] text-slate-500">
                                {s.channel?.name || "No channel"} • {new Date(s.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            s.status === "live" ? "bg-red-500/20 text-red-300" :
                            s.status === "ended" ? "bg-slate-700/40 text-slate-300" :
                            "bg-cyan-500/20 text-cyan-300"
                          }`}>
                            {s.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}

          {view === "channels" && (
            <div className="space-y-5">
              <Header
                user={user}
                title="Channels"
                subtitle="Manage multi-channel YouTube accounts with separate Google Cloud credentials"
                onNavigate={setView}
                onLogout={handleLogout}
              />
              <ChannelList />
            </div>
          )}

          {view === "streams" && (
            <div className="space-y-5">
              <Header
                user={user}
                title="Streams"
                subtitle="Create and manage live streams using YouTube stream keys"
                onNavigate={setView}
                onLogout={handleLogout}
              />
              <StreamList />
            </div>
          )}

          {view === "files" && (
            <div className="space-y-5">
              <Header
                user={user}
                title="Files"
                subtitle="Upload video files from PC or import from Google Drive"
                onNavigate={setView}
                onLogout={handleLogout}
              />
              <FileManager />
            </div>
          )}

          {view === "activity" && (
            <div className="space-y-5">
              <Header
                user={user}
                title="Activity Log"
                subtitle="Recent system and user activity"
                onNavigate={setView}
                onLogout={handleLogout}
              />
              <ActivityFeed logs={dashboardData?.recentLogs || []} />
            </div>
          )}

          {view === "settings" && (
            <div className="space-y-5">
              <Header
                user={user}
                title="Settings"
                subtitle="Manage your account and system configuration"
                onNavigate={setView}
                onLogout={handleLogout}
              />
              <SettingsView user={user} />
            </div>
          )}
        </main>

        <footer className="mt-auto border-t border-slate-800/60 px-6 py-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>ZephyrStream v1.2.1 — Multi-Channel Live Streaming</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                {realtimeConnected ? (
                  <>
                    <Wifi className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">Realtime Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3 text-slate-500" />
                    <span>Realtime Offline</span>
                  </>
                )}
              </span>
              <span className="flex items-center gap-1">
                <Server className="h-3 w-3" />
                <span>VPS Online</span>
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
