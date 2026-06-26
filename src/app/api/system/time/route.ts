// GET /api/system/time — Get current server date and time
// Used by the header clock to display the VPS server time (not client time)
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    // Allow this endpoint without auth so the login page can also show
    // the server time. The time itself is not sensitive info.
    const now = new Date();

    return NextResponse.json({
      iso: now.toISOString(),
      timestamp: now.getTime(),
      // Pre-formatted for display convenience
      date: now.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      time: now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
