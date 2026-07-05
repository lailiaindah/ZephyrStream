// GET /api/activity-logs — List recent activity logs
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    // Validate limit — must be a finite positive integer. NaN/negative
    // values would cause Prisma to throw on `take`.
    const rawLimit = parseInt(searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50;
    const category = searchParams.get("category");

    const logs = await db.activityLog.findMany({
      where: {
        userId: user.id,
        ...(category && category !== "all" ? { category } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
