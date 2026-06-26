"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

// Displays the VPS server date & time (not the client's browser time).
// Polls /api/system/time every second and updates the display.
// Falls back gracefully if the API is unreachable.
export function ServerClock() {
  const [time, setTime] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [tz, setTz] = useState<string>("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function fetchTime() {
      try {
        const res = await fetch("/api/system/time", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch server time");
        const data = await res.json();
        if (!mounted) return;
        setTime(data.time);
        setDate(data.date);
        setTz(data.timezone);
        setError(false);
      } catch {
        if (mounted) setError(true);
      }
    }

    // Fetch immediately, then every second for a smooth ticking clock
    fetchTime();
    const interval = setInterval(fetchTime, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return (
      <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 px-2">
        <Clock className="h-3.5 w-3.5" />
        <span>--:--:--</span>
      </div>
    );
  }

  return (
    <div
      className="hidden md:flex flex-col items-end leading-tight px-2 border-r border-slate-800/60 mr-1 pr-3"
      title={`Server timezone: ${tz}`}
    >
      <div className="flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-cyan-300" />
        <span className="text-sm font-mono font-semibold text-white tabular-nums">
          {time || "--:--:--"}
        </span>
      </div>
      <span className="text-[10px] text-slate-500">
        {date || "Loading..."} · {tz}
      </span>
    </div>
  );
}
