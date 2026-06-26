// GET /api/channels — List user's channels
// POST /api/channels — Create a new channel (with Google Cloud credentials)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const channels = await db.channel.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { streams: true } },
      },
    });

    return NextResponse.json({ channels });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, description, clientId, clientSecret } = body;

    if (!name || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Name, clientId, and clientSecret are required" },
        { status: 400 }
      );
    }

    const channel = await db.channel.create({
      data: {
        userId: user.id,
        name,
        description: description || null,
        clientId,
        clientSecret,
        status: "inactive",
      },
    });

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "info",
        category: "channel",
        message: `Channel created: ${name}`,
        details: `Channel ID: ${channel.id}`,
      },
    });

    return NextResponse.json({ channel });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
