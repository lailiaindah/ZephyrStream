// POST /api/files/probe — Probe a video file for metadata
//
// SECURITY: This endpoint previously accepted an arbitrary `filePath` and
// passed it directly to ffprobe — allowing any authenticated user to read
// metadata (size, duration, codec) of ANY file on the server, including
// /etc/passwd, the SQLite DB, or another user's uploads.
//
// The fix: only accept a `fileId`, look up the UploadedFile row owned by
// the calling user, and probe its `storagePath`. No client-supplied path
// ever reaches ffprobe.
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { probeVideo } from "@/lib/ffmpeg";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { fileId, filePath } = body;

    // Preferred flow: lookup by fileId (safe — we filter by userId).
    if (fileId) {
      const file = await db.uploadedFile.findFirst({
        where: { id: fileId, userId: user.id },
        select: { id: true, storagePath: true, originalName: true },
      });
      if (!file || !file.storagePath) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }
      const info = await probeVideo(file.storagePath);
      return NextResponse.json({ info, originalName: file.originalName });
    }

    // Legacy fallback for backward compatibility — but ONLY allow paths
    // that match an UploadedFile.storagePath owned by the calling user.
    // This blocks path traversal while keeping old clients working.
    if (filePath) {
      const file = await db.uploadedFile.findFirst({
        where: { userId: user.id, storagePath: filePath },
        select: { id: true, storagePath: true, originalName: true },
      });
      if (!file) {
        return NextResponse.json(
          { error: "File not found in your uploads" },
          { status: 404 }
        );
      }
      const info = await probeVideo(file.storagePath);
      return NextResponse.json({ info, originalName: file.originalName });
    }

    return NextResponse.json(
      { error: "fileId (preferred) or filePath is required" },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
