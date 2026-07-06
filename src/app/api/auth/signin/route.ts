// POST /api/auth/signin — Login user
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";
import { checkRateLimit, getClientIP } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  try {
    // Rate limit: max 10 signin attempts per IP per minute
    const ip = getClientIP(req);
    const rateLimit = checkRateLimit(ip, 10, 60 * 1000);
    if (!rateLimit.allowed) {
      const retryAfterSec = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${retryAfterSec} seconds.` },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfterSec.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimit.resetAt.toString(),
          },
        }
      );
    }

    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const token = createToken({
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
      role: user.role,
    });
    await setSessionCookie(token);

    try {
      await db.activityLog.create({
        data: {
          userId: user.id,
          level: "info",
          category: "auth",
          message: `User signed in: ${user.email}`,
        },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    });
  } catch (error: any) {
    console.error("Signin error:", error);
    return NextResponse.json(
      { error: "Failed to sign in" },
      { status: 500 }
    );
  }
}
