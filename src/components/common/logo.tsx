"use client";

import { Wind } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
}

const sizes = {
  sm: { icon: 18, text: "text-base", gap: "gap-2" },
  md: { icon: 24, text: "text-lg", gap: "gap-2.5" },
  lg: { icon: 32, text: "text-2xl", gap: "gap-3" },
  xl: { icon: 44, text: "text-3xl", gap: "gap-4" },
};

export function Logo({ size = "md", showText = true, className }: LogoProps) {
  const s = sizes[size];
  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <div className="relative">
        <div className="absolute inset-0 bg-cyan-400/20 blur-xl rounded-full" aria-hidden />
        <div className="relative flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-emerald-500/20 border border-cyan-400/30"
             style={{ width: s.icon + 12, height: s.icon + 12 }}>
          <Wind className="text-cyan-300" style={{ width: s.icon, height: s.icon }} strokeWidth={2.5} />
        </div>
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={cn("font-bold tracking-tight zephyr-text-gradient", s.text)}>
            ZephyrStream
          </span>
          {size === "lg" || size === "xl" ? (
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mt-1">
              Multi-Channel Live
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
