"use client";

import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { AlertCircle, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function SystemAlerts() {
  const { data: alerts } = useQuery({
    queryKey: ["system-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/system/alerts");
      const data = await res.json();
      return data.alerts as any[];
    },
    refetchInterval: 30000,
  });

  if (!alerts || alerts.length === 0) {
    return null; // Don't render anything if no alerts
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-amber-300">System Alerts</h3>
          <span className="text-[10px] text-amber-400/60 ml-auto">{alerts.length} alert(s)</span>
        </div>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {alerts.slice(0, 5).map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "flex items-start gap-2 p-2 rounded-md text-xs",
                alert.level === "error"
                  ? "bg-rose-500/10 border border-rose-500/20 text-rose-300"
                  : "bg-amber-500/10 border border-amber-500/20 text-amber-300"
              )}
            >
              {alert.level === "error" ? (
                <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <p className="font-medium">{alert.message}</p>
                {alert.details && (
                  <p className="text-[10px] opacity-70 mt-0.5 truncate">{alert.details}</p>
                )}
                <p className="text-[9px] opacity-50 mt-0.5">
                  {new Date(alert.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
