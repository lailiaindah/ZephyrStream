"use client";

import { useEffect, useState, useRef } from "react";
import { Clock } from "lucide-react";

// Displays the VPS server date & time (not the client's browser time).
//
// Previously this polled /api/system/time every second — 86,400 requests
// per day per open tab. Now we fetch once on mount, then increment the
// displayed time client-side every second. We re-sync from the server
// every 5 minutes to correct any drift.
export function ServerClock() {
  const [time, setTime] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [tz, setTz] = useState<string>("");
  const [error, setError] = useState(false);
  // Store the server's epoch milliseconds + the local performance.now()
  // at fetch time, so we can compute the current server time without
  // re-fetching.
  const serverEpochRef = useRef<number>(0);
  const localPerfRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;

    async function fetchTime() {
      try {
        const res = await fetch("/api/system/time", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch server time");
        const data = await res.json();
        if (!mounted) return;

        // The API returns { time, date, timezone, iso } — use iso (if
        // available) for the epoch, otherwise parse the time string.
        // We store the server epoch + local performance.now() so we can
        // compute the current server time with millisecond precision.
        const iso = data.iso || new Date(`${data.date}T${data.time}`).toISOString();
        serverEpochRef.current = new Date(iso).getTime();
        localPerfRef.current = performance.now();

        updateDisplay();
        setError(false);
      } catch {
        if (mounted) setError(true);
      }
    }

    function updateDisplay() {
      if (serverEpochRef.current === 0) return;
      // Compute current server time = serverEpoch + elapsed local time
      const elapsed = performance.now() - localPerfRef.current;
      const now = new Date(serverEpochRef.current + elapsed);
      const pad = (n: number) => String(n).padStart(2, "0");
      setTime(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      setDate(`${monthNames[now.getMonth()]} ${now.getDate()}`);
    }

    // Fetch once on mount
    fetchTime();

    // Tick the display every second (no network request)
    const tickInterval = setInterval(updateDisplay, 1000);

    // Re-sync from server every 5 minutes to correct drift
    const syncInterval = setInterval(fetchTime, 5 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(tickInterval);
      clearInterval(syncInterval);
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
