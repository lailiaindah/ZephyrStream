// GET /api/system/ffmpeg — Detect FFmpeg installation
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { detectFFmpeg } from "@/lib/ffmpeg";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await detectFFmpeg();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
