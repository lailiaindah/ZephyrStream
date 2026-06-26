"use client";

import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "@/components/common/status-badge";
import { Radio, Youtube, FileText, Activity as ActivityIcon, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  level: string;
  category: string;
  message: string;
  details?: string | null;
  createdAt: string;
}

const levelIcon = {
  info: Info,
  success: CheckCircle2,
  warn: AlertCircle,
  error: AlertCircle,
};

const levelColor = {
  info: "text-slate-400",
  success: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-rose-400",
};

const categoryIcon = {
  auth: ActivityIcon,
  channel: Youtube,
  stream: Radio,
  file: FileText,
  system: ActivityIcon,
};

export function ActivityFeed({ logs }: { logs: ActivityItem[] }) {
  return (
    <Card className="border-slate-800/60 bg-slate-900/40 backdrop-blur-sm">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
          <ActivityIcon className="h-4 w-4 text-slate-500" />
        </div>
        <ScrollArea className="h-80">
          <div className="space-y-3 pr-2">
            {logs.length === 0 ? (
              <div className="text-center py-8">
                <ActivityIcon className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No recent activity</p>
              </div>
            ) : (
              logs.map((log) => {
                const LevelIcon = levelIcon[log.level as keyof typeof levelIcon] || Info;
                const CatIcon = categoryIcon[log.category as keyof typeof categoryIcon] || ActivityIcon;
                return (
                  <div
                    key={log.id}
                    className="flex gap-3 p-3 rounded-lg bg-slate-950/40 border border-slate-800/40 hover:border-slate-700/60 transition-colors"
                  >
                    <div className={cn("mt-0.5", levelColor[log.level as keyof typeof levelColor] || "text-slate-400")}>
                      <LevelIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <CatIcon className="h-3 w-3 text-slate-500" />
                        <span className="text-[10px] uppercase tracking-wider text-slate-500">
                          {log.category}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200">{log.message}</p>
                      {log.details && (
                        <p className="text-xs text-slate-500 mt-0.5">{log.details}</p>
                      )}
                      <p className="text-[10px] text-slate-600 mt-1">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </Card>
  );
}
