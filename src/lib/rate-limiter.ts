// Simple in-memory rate limiter for auth endpoints.
// Tracks requests per IP address with a sliding window.
// For single-VPS deployments this is sufficient — no Redis needed.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request from the given IP is allowed under the rate limit.
 * Returns { allowed: true } if the request is within the limit.
 * Returns { allowed: false, remaining: 0, resetAt } if the limit is exceeded.
 *
 * @param identifier - IP address or other unique identifier
 * @param maxAttempts - Maximum attempts allowed in the window
 * @param windowMs - Time window in milliseconds
 */
export function checkRateLimit(
  identifier: string,
  maxAttempts: number = 5,
  windowMs: number = 60 * 1000
): RateLimitResult {
  const now = Date.now();
  const key = identifier;

  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    // First request or window expired → start fresh
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxAttempts) {
    // Rate limit exceeded
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  // Within limit → increment
  entry.count++;
  return { allowed: true, remaining: maxAttempts - entry.count, resetAt: entry.resetAt };
}

/**
 * Extract the client IP from a Next.js request.
 * Checks X-Forwarded-For, X-Real-IP, and falls back to the socket address.
 */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = req.headers.get("x-real-ip");
  if (realIP) {
    return realIP.trim();
  }
  // Fallback for direct connections (no proxy)
  // Next.js doesn't expose socket directly in App Router, so use a hash
  // of the user agent + accept-language as a pseudo-identifier
  const ua = req.headers.get("user-agent") || "unknown";
  const al = req.headers.get("accept-language") || "";
  return `fallback:${Buffer.from(ua + al).toString("base64").slice(0, 16)}`;
}
