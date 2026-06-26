// POST /api/system/speed-test — Run an internet speed test
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runInternetSpeedTest } from "@/lib/system-stats";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await runInternetSpeedTest();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
