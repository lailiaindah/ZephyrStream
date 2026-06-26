// GET /api/system/stats — Get current VPS system stats
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSystemStats, getHistoricalStats } from "@/lib/system-stats";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [stats, history] = await Promise.all([
      getSystemStats(),
      getHistoricalStats(60),
    ]);

    return NextResponse.json({ stats, history });
  } catch (error: any) {
    console.error("System stats error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
