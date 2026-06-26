"use client";

import { cn } from "@/lib/utils";
import { STREAM_STATUS_META, CHANNEL_STATUS_META } from "@/lib/constants";

interface StatusBadgeProps {
  status: string;
  type?: "stream" | "channel";
  pulse?: boolean;
  className?: string;
}

export function StatusBadge({ status, type = "stream", pulse, className }: StatusBadgeProps) {
  const meta = type === "stream"
    ? STREAM_STATUS_META[status] || STREAM_STATUS_META.scheduled
    : CHANNEL_STATUS_META[status] || CHANNEL_STATUS_META.inactive;

  const dotColor =
    status === "live" ? "bg-red-500" :
    status === "active" ? "bg-emerald-400" :
    status === "preparing" || status === "stopping" ? "bg-amber-400" :
    status === "error" ? "bg-rose-500" :
    "bg-slate-500";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        meta.color,
        meta.bg,
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          dotColor,
          (pulse || status === "live" || status === "active") && "zephyr-pulse-dot"
        )}
      />
      {meta.label}
    </span>
  );
}
