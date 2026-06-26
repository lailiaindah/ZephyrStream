// POST /api/files/probe — Probe a video file for metadata
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { probeVideo } from "@/lib/ffmpeg";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { filePath } = body;
    if (!filePath) {
      return NextResponse.json({ error: "File path is required" }, { status: 400 });
    }

    const info = await probeVideo(filePath);
    return NextResponse.json({ info });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
