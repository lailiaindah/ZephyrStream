// POST /api/system/speed-test — Run an internet speed test using Ookla CLI
//
// The Ookla CLI can take 15-30 seconds (download + upload phases). We
// set maxDuration to 120s so the request doesn't time out on slow
// connections. The frontend shows a spinner during this time.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runInternetSpeedTest } from "@/lib/system-stats";
import { canAccessSystemEndpoints } from "@/lib/access-control";

export const maxDuration = 120; // 2 minutes

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!(await canAccessSystemEndpoints(user.role))) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const result = await runInternetSpeedTest();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
