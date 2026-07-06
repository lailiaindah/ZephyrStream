// Access control helpers for system endpoints.
//
// In single-user VPS deployments (typical ZephyrStream use case), the
// owner is the only user and may have role="user". We don't want to
// block them from system endpoints. In multi-user deployments, only
// users with role="admin" should be able to trigger destructive or
// resource-intensive operations (cleanup, backup, speed-test, etc.).
//
// The policy: if any admin exists in the DB, require admin role.
// Otherwise, allow any authenticated user.

import { db } from "@/lib/db";

let _adminExistsCache: boolean | null = null;
let _adminCacheTime = 0;
const ADMIN_CACHE_TTL_MS = 60_000; // re-check at most once per minute

export async function adminExists(): Promise<boolean> {
  // Cache the result for 1 minute to avoid hitting the DB on every
  // system endpoint call. The "does an admin exist?" answer changes
  // very rarely (only when an admin is created or has their role
  // revoked), so a short TTL is fine.
  const now = Date.now();
  if (_adminExistsCache !== null && now - _adminCacheTime < ADMIN_CACHE_TTL_MS) {
    return _adminExistsCache;
  }
  const count = await db.user.count({ where: { role: "admin" } });
  _adminExistsCache = count > 0;
  _adminCacheTime = now;
  return _adminExistsCache;
}

/**
 * Returns true if the given user role is allowed to access system
 * endpoints. The check is: role === "admin" OR no admin exists in the
 * system yet (single-user mode).
 */
export async function canAccessSystemEndpoints(userRole: string): Promise<boolean> {
  if (userRole === "admin") return true;
  return !(await adminExists());
}
