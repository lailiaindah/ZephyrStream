"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Gauge, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuotaDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["quota"],
    queryFn: async () => {
      const res = await fetch("/api/quota");
      return res.json();
    },
    refetchInterval: 30000,
  });

  if (isLoading || !data) {
    return (
      <Card className="border-slate-800/60 bg-slate-900/40">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-semibold text-white">YouTube API Quota</h3>
          </div>
          <div className="h-20 zephyr-shimmer rounded-lg" />
        </div>
      </Card>
    );
  }

  const usagePercent = data.usagePercent || 0;
  const isWarning = usagePercent > 70;
  const isCritical = usagePercent > 90;

  return (
    <Card className="border-slate-800/60 bg-slate-900/40">
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-cyan-300" />
            <h3 className="text-sm font-semibold text-white">YouTube API Quota</h3>
          </div>
          {isCritical ? (
            <span className="flex items-center gap-1 text-xs text-rose-400">
              <AlertCircle className="h-3 w-3" /> Critical
            </span>
          ) : isWarning ? (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertCircle className="h-3 w-3" /> Warning
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> Healthy
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">Used today</span>
            <span className={cn(
              "font-semibold",
              isCritical ? "text-rose-300" : isWarning ? "text-amber-300" : "text-cyan-300"
            )}>
              {data.used?.toLocaleString() || 0} / {data.dailyLimit?.toLocaleString() || 10000} units
            </span>
          </div>

          <Progress
            value={usagePercent}
            className={cn(
              "h-2",
              isCritical && "[&>div]:bg-rose-500",
              isWarning && !isCritical && "[&>div]:bg-amber-500",
              !isWarning && !isCritical && "[&>div]:bg-cyan-500"
            )}
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">
              {data.remaining?.toLocaleString() || 10000} units remaining
            </span>
            <span className="text-slate-500">{usagePercent.toFixed(1)}%</span>
          </div>

          {data.channels > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-800/60 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Channels</span>
                <span className="text-slate-300">{data.channels}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Total quota (all channels)</span>
                <span className="text-slate-300">{data.perChannelQuota?.toLocaleString() || 10000}</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">Stream events today</span>
                <span className="text-slate-300">{data.eventsToday || 0}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
