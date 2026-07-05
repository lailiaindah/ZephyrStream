// Authentication library — JWT-based sessions stored in HttpOnly cookies
// Uses Web Crypto for hashing where possible, bcryptjs for password hashing

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { SESSION_COOKIE_NAME, SESSION_EXPIRY_DAYS } from "@/lib/constants";

// JWT secret for signing session tokens.
// SECURITY: warn loudly at startup if the dev fallback is being used in
// production — any attacker who knows this string can forge valid JWTs
// and bypass authentication entirely.
const JWT_SECRET = process.env.JWT_SECRET || "zephystream-dev-secret-change-in-production-please";

if (process.env.NODE_ENV === "production" && JWT_SECRET === "zephystream-dev-secret-change-in-production-please") {
  console.warn(
    "⚠️  WARNING: JWT_SECRET is not set in production! Using the default dev secret.\n" +
    "   Any attacker can forge valid session tokens. Set JWT_SECRET in your .env file to a long random string:\n" +
    "   echo \"JWT_SECRET=$(openssl rand -hex 32)\" >> .env"
  );
}

export interface SessionPayload {
  userId: string;
  email: string;
  name?: string;
  role: string;
}

// Hash a plaintext password using bcrypt
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
}

// Verify a plaintext password against a hash
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Create a signed JWT token for a user
export function createToken(payload: SessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: `${SESSION_EXPIRY_DAYS}d`,
  });
}

// Verify and decode a JWT token
export function verifyToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SessionPayload;
    return decoded;
  } catch {
    return null;
  }
}

// Set the session cookie on the response
export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  // In production, only set secure:true if actually using HTTPS.
  // When accessing via http://IP:3000 (no domain/HTTPS), secure cookies
  // won't be sent by the browser, causing "Unauthorized" on all API calls.
  // We check for an explicit HTTPS env var or fall back to non-secure.
  const isHttps = process.env.HTTPS === "true" || process.env.FORCE_HTTPS === "true";
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_EXPIRY_DAYS,
  });
}

// Clear the session cookie (logout)
export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

// Get the current authenticated user from the session cookie
// Returns null if not authenticated
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) return null;

    const user = await db.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        createdAt: true,
      },
    });

    return user;
  } catch {
    return null;
  }
}

// Require authentication — throws if not authenticated
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

// Require the current user to have the "admin" role. Used by system
// endpoints (cleanup, backup, speed-test, etc.) that affect the whole
// server — regular users shouldn't be able to trigger backups, force
// cleanup cycles, or run bandwidth-burning speed tests.
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

// Validate email format
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate password strength (min 8 chars, at least 1 letter and 1 number)
export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters long" };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "Password must contain at least one number" };
  }
  return { valid: true };
}
