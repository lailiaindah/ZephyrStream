// GET /api/templates — List user's stream templates
// POST /api/templates — Save a new template from stream config
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const templates = await db.streamTemplate.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ templates });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      name,
      encoder, copyMode, videoBitrate, audioBitrate, resolution, fps, preset,
      privacyStatus, categoryId, tags, playlistId, alteredContent,
      minHours, maxHours, spinnerMode, spinnerEmojis, autoCreateSchedule,
      shuffleTitle, shuffleThumbnail,
    } = body;

    if (!name) return NextResponse.json({ error: "Template name is required" }, { status: 400 });

    // Convert spinnerEmojis to a JSON string (or null) BEFORE the Prisma call.
    // The frontend sends a JS array (e.g. ["🎵","🎶"]) but Prisma expects
    // a String. Empty array [] must become null (not "[]").
    let spinnerEmojisStr: string | null = null;
    if (Array.isArray(spinnerEmojis)) {
      if (spinnerEmojis.length > 0) {
        spinnerEmojisStr = JSON.stringify(spinnerEmojis);
      }
      // else: empty array → null
    } else if (typeof spinnerEmojis === "string" && spinnerEmojis.trim() !== "") {
      spinnerEmojisStr = spinnerEmojis;
    }

    const template = await db.streamTemplate.create({
      data: {
        userId: user.id,
        name,
        encoder: encoder || "auto",
        copyMode: copyMode ?? false,
        videoBitrate: videoBitrate || "4500k",
        audioBitrate: audioBitrate || "160k",
        resolution: resolution || "1920x1080",
        fps: fps || 30,
        preset: preset || "veryfast",
        privacyStatus: privacyStatus || "public",
        categoryId: categoryId || "22",
        tags: tags || null,
        playlistId: playlistId || null,
        alteredContent: alteredContent ?? false,
        minHours: minHours ?? 2.0,
        maxHours: maxHours ?? 4.0,
        spinnerMode: spinnerMode || "off",
        spinnerEmojis: spinnerEmojisStr,
        autoCreateSchedule: autoCreateSchedule ?? false,
        shuffleTitle: shuffleTitle ?? false,
        shuffleThumbnail: shuffleThumbnail ?? false,
      },
    });

    return NextResponse.json({ template });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
