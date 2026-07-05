// POST /api/auth/signup — Register a new user
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword, createToken, setSessionCookie, isValidEmail, validatePassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, name } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.message }, { status: 400 });
    }

    // Create the new user. We rely on the unique constraint on `email`
    // to handle the race condition where two concurrent signups submit
    // the same email — both pass the existence check, but only one
    // create succeeds; the other throws Prisma P2002 which we handle
    // below as a 409.
    const passwordHash = await hashPassword(password);
    let user;
    try {
      user = await db.user.create({
        data: {
          email: email.toLowerCase(),
          name: name || email.split("@")[0],
          passwordHash,
          role: "user",
        },
        select: { id: true, email: true, name: true, role: true },
      });
    } catch (err: any) {
      // P2002 = unique constraint violation (email already exists)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }
      throw err; // re-throw to outer catch
    }

    // Create session
    const token = createToken({
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
      role: user.role,
    });
    await setSessionCookie(token);

    // Log activity
    await db.activityLog.create({
      data: {
        userId: user.id,
        level: "success",
        category: "auth",
        message: `New account created: ${user.email}`,
      },
    });

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    // Don't leak internal error details to the client
    return NextResponse.json(
      { error: "Failed to create account. Please try again." },
      { status: 500 }
    );
  }
}
