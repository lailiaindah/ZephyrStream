"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  Search,
  LogOut,
  User,
  Settings,
  Activity as ActivityIcon,
  X,
} from "lucide-react";
import { Logo } from "@/components/common/logo";
import { ServerClock } from "@/components/layout/server-clock";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface HeaderProps {
  user: { email: string; name?: string | null } | null;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onNavigate?: (view: "dashboard" | "channels" | "streams" | "files" | "activity" | "settings") => void;
  onLogout?: () => void;
}

export function Header({ user, title, subtitle, actions, onNavigate, onLogout }: HeaderProps) {
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const initials = (user?.name || user?.email || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Fetch recent activity logs for the notification panel
  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/activity-logs?limit=20");
      const data = await res.json();
      return data.logs as any[];
    },
    refetchInterval: 30000,
  });

  // Global search across channels, streams, files
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ["global-search", searchQuery],
    queryFn: async () => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return { channels: [], streams: [], files: [] };

      const [channelsRes, streamsRes, filesRes] = await Promise.all([
        fetch("/api/channels").then((r) => r.json()),
        fetch("/api/streams").then((r) => r.json()),
        fetch("/api/files").then((r) => r.json()),
      ]);

      return {
        channels: (channelsRes.channels || []).filter((c: any) =>
          c.name.toLowerCase().includes(q) || (c.youtubeChannelName || "").toLowerCase().includes(q)
        ),
        streams: (streamsRes.streams || []).filter((s: any) =>
          s.name.toLowerCase().includes(q)
        ),
        files: (filesRes.files || []).filter((f: any) =>
          f.originalName.toLowerCase().includes(q)
        ),
      };
    },
    enabled: searchQuery.trim().length > 0,
  });

  const unreadCount = (notifData || []).slice(0, 5).length;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-800/60 bg-slate-950/60 backdrop-blur-xl">
      <div className="flex items-center gap-3 min-w-0">
        <div className="lg:hidden">
          <Logo size="sm" showText={false} />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold text-white truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-slate-400 truncate hidden sm:block">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actions}

        {/* Server date & time clock */}
        <ServerClock />

        {/* Search */}
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-100 hover:bg-slate-800/60">
              <Search className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 sm:w-96 p-0 bg-slate-950 border-slate-800" align="end">
            <div className="p-3 border-b border-slate-800">
              <Input
                placeholder="Search channels, streams, files…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
            <ScrollArea className="h-72">
              {!searchQuery.trim() ? (
                <div className="p-6 text-center">
                  <Search className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Type to search across your content</p>
                </div>
              ) : searchLoading ? (
                <div className="p-6 text-center text-xs text-slate-500">Searching…</div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {searchData?.channels?.length === 0 &&
                  searchData?.streams?.length === 0 &&
                  searchData?.files?.length === 0 ? (
                    <div className="p-6 text-center">
                      <X className="h-6 w-6 text-slate-700 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">No results for &quot;{searchQuery}&quot;</p>
                    </div>
                  ) : (
                    <>
                      {searchData?.channels?.length > 0 && (
                        <div className="p-2">
                          <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">Channels</p>
                          {searchData.channels.map((c: any) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setSearchOpen(false);
                                onNavigate?.("channels");
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-800 text-left"
                            >
                              <span className="text-cyan-300">📺</span>
                              <span className="text-sm text-slate-200 truncate">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchData?.streams?.length > 0 && (
                        <div className="p-2">
                          <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">Streams</p>
                          {searchData.streams.map((s: any) => (
                            <button
                              key={s.id}
                              onClick={() => {
                                setSearchOpen(false);
                                onNavigate?.("streams");
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-800 text-left"
                            >
                              <span className="text-rose-300">📡</span>
                              <span className="text-sm text-slate-200 truncate">{s.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {searchData?.files?.length > 0 && (
                        <div className="p-2">
                          <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-500">Files</p>
                          {searchData.files.map((f: any) => (
                            <button
                              key={f.id}
                              onClick={() => {
                                setSearchOpen(false);
                                onNavigate?.("files");
                              }}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-800 text-left"
                            >
                              <span className="text-emerald-300">🎬</span>
                              <span className="text-sm text-slate-200 truncate">{f.originalName}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-slate-400 hover:text-slate-100 hover:bg-slate-800/60">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-cyan-400" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 sm:w-96 p-0 bg-slate-950 border-slate-800" align="end">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-cyan-300" />
                <span className="text-sm font-semibold text-white">Recent Activity</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onNavigate?.("activity")}
                className="h-7 text-xs text-slate-400 hover:text-slate-100"
              >
                View all
              </Button>
            </div>
            <ScrollArea className="h-80">
              {!notifData || notifData.length === 0 ? (
                <div className="p-6 text-center">
                  <Bell className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {notifData.slice(0, 10).map((log: any) => (
                    <div key={log.id} className="p-3 hover:bg-slate-900/40">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          log.level === "success" ? "bg-emerald-400" :
                          log.level === "error" ? "bg-rose-400" :
                          log.level === "warn" ? "bg-amber-400" :
                          "bg-slate-500"
                        }`} />
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">
                          {log.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200">{log.message}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* Profile dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
              <Avatar className="h-9 w-9 border border-slate-700 hover:border-cyan-500/50 transition-colors">
                <AvatarFallback className="bg-gradient-to-br from-cyan-500/30 to-emerald-500/30 text-cyan-200 text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-slate-950 border-slate-800">
            <DropdownMenuLabel className="text-slate-200">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user?.name || "User"}</span>
                <span className="text-xs text-slate-500 font-normal truncate">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-slate-800" />
            <DropdownMenuItem
              onClick={() => onNavigate?.("settings")}
              className="text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onNavigate?.("activity")}
              className="text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <ActivityIcon className="h-4 w-4 mr-2" />
              Activity Log
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-800" />
            <DropdownMenuItem
              onClick={() => {
                if (onLogout) {
                  onLogout();
                } else {
                  fetch("/api/auth/signout", { method: "POST" }).then(() => {
                    queryClient.setQueryData(["auth-me"], { user: null });
                    queryClient.clear();
                    toast.success("Signed out");
                  });
                }
              }}
              className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
