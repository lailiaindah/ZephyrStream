// POST /api/auth/signin — Login user
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, createToken, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Trim+lowercase email — mobile keyboards and browser autofill
    // sometimes add trailing whitespace, which would cause a silent
    // mismatch against the stored (already-trimmed) email.
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

    // Create session
    const token = createToken({
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
      role: user.role,
    });
    await setSessionCookie(token);

    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "info",
        category: "auth",
        message: `User signed in: ${user.email}`,
      },
    });

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
      { error: error.message || "Failed to sign in" },
      { status: 500 }
    );
  }
}
