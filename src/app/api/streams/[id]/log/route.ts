// GET /api/streams/[id]/log — Read the tail of a stream's log file
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { readStreamLog } from "@/lib/ffmpeg";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const stream = await db.stream.findFirst({
      where: { id, userId: user.id },
    });

    if (!stream) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const lines = parseInt(url.searchParams.get("lines") || "200", 10);

    if (!stream.logFile) {
      return NextResponse.json({ log: "", message: "No log file available" });
    }

    const log = await readStreamLog(stream.logFile, lines);
    return NextResponse.json({ log, logFile: stream.logFile });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
