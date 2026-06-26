"use client";

import { useEffect } from "react";

// Triggers the server-side scheduler to start on first client mount.
// The scheduler lives in-memory on the server; this component just pings
// /api/scheduler once per browser session.
export function SchedulerBootstrap() {
  useEffect(() => {
    // Fire-and-forget — we don't need the result
    fetch("/api/scheduler", { method: "POST" }).catch(() => {});
  }, []);

  return null;
}
