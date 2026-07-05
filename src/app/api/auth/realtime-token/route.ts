// POST /api/auth/realtime-token — Get a short-lived JWT for realtime service auth
//
// The realtime Socket.io service requires JWT auth. The session cookie
// is HttpOnly (JS can't read it), so the client fetches this endpoint
// to get the token value, which it passes via socket.io's `auth` handshake.
//
// The token is the SAME as the session JWT — we just return it so the
// client can pass it to the cross-origin socket connection on port 3003.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createToken } from "@/lib/auth";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Re-issue a fresh token with the same payload. This is safe because
    // the user is already authenticated via the session cookie.
    const token = createToken({
      userId: user.id,
      email: user.email,
      name: user.name || undefined,
      role: user.role,
    });

    return NextResponse.json({ token });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  }
}
