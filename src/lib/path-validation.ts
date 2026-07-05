// Path validation helpers for stream sources.
//
// The "local folder" source mode lets a user point a stream at any folder
// on the VPS that contains video files. This is intentional (users often
// have their own video libraries outside the upload directory), but it
// also creates a path-traversal / arbitrary-file-read risk if not
// constrained. We block paths that:
//   - contain ".." segments after normalization
//   - are not absolute (relative paths can be confusing but not unsafe;
//     we still resolve them against cwd to make them absolute)
//   - point at well-known sensitive system directories
//
// The check is intentionally permissive about user home dirs and the
// UPLOAD_DIR — those are the legitimate use cases.

import path from "path";

// Directories we never want to expose as a video source. Even if the
// folder happens to contain video files, allowing FFmpeg to stream
// /etc/passwd or /proc/self/environ as "video" is a bad idea.
const BLOCKED_PREFIXES = [
  "/etc",
  "/var/log",
  "/var/lib",
  "/proc",
  "/sys",
  "/dev",
  "/boot",
  "/run",
  "/snap",
  "/usr/share",
  "/usr/lib",
  "/usr/include",
  "/root", // root's home — non-root processes shouldn't read this anyway
  "/.git",
];

export interface PathValidationResult {
  ok: boolean;
  resolved?: string;
  reason?: string;
}

export function validateSourcePath(rawPath: string): PathValidationResult {
  if (!rawPath || typeof rawPath !== "string") {
    return { ok: false, reason: "Path is required" };
  }

  // Reject paths that contain null bytes (common traversal trick).
  if (rawPath.includes("\0")) {
    return { ok: false, reason: "Path contains null byte" };
  }

  // Resolve to absolute, normalized path (collapses ".." segments).
  const resolved = path.resolve(rawPath);

  // After resolution, there should be no ".." left. If the original
  // path was something like "/home/../etc", `path.resolve` collapses
  // it to "/etc" — which then trips the blocked-prefix check below.
  // Either way, suspicious input is rejected.

  // Reject blocked system directories.
  for (const prefix of BLOCKED_PREFIXES) {
    if (resolved === prefix || resolved.startsWith(prefix + "/")) {
      return {
        ok: false,
        reason: `Path "${resolved}" is in a blocked system directory (${prefix}). Use a folder under your home directory or the uploads directory.`,
      };
    }
  }

  return { ok: true, resolved };
}
