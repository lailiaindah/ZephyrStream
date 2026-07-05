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
    // Validate lines — must be a finite positive integer between 1 and 5000.
    // Negative values would make `slice(-lines)` read the whole file; very
    // large values could OOM the server.
    const rawLines = parseInt(url.searchParams.get("lines") || "200", 10);
    const lines = Number.isFinite(rawLines) && rawLines > 0
      ? Math.min(rawLines, 5000)
      : 200;

    if (!stream.logFile) {
      return NextResponse.json({ log: "", message: "No log file available" });
    }

    const log = await readStreamLog(stream.logFile, lines);
    // Don't return the server-side filesystem path to the client —
    // it's unnecessary information disclosure that reveals the server's
    // directory structure.
    return NextResponse.json({ log });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
