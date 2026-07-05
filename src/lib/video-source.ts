// Shared helpers for resolving a stream's video source into a list of
// local file paths. Used by the scheduler, the start route, and any
// other place that needs to spawn FFmpeg with a list of videos.
//
// Resolution order:
//  1. If sourceType === "local" && sourcePath  → read all video files
//     in the folder.
//  2. Else, merge:
//     a) Individual file IDs from `sourceFileIds` (JSON array).
//     b) For each playlist ID in `playlistSourceIds` (JSON array),
//        expand all of its items in sortOrder, de-duplicating by fileId.
//
// After the list is built, callers can apply shuffle if the stream
// has shuffle enabled (or if a playlist's shuffleOwn setting overrides).
//
// The `playlistShuffleOverride` returned per playlist is informational;
// callers usually apply the stream-level `shuffle` flag uniformly.

import { db } from "@/lib/db";

const VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".ts", ".flv"];

export interface ResolvedVideoSource {
  videoFiles: string[];
  // Number of individual files (from sourceFileIds) — for logging.
  individualCount: number;
  // Number of files contributed by playlists (after de-dup) — for logging.
  playlistCount: number;
  // Number of playlists that were actually expanded (skipped/missing ones
  // are silently dropped, but logged here for diagnostics).
  playlistExpandedCount: number;
  // True if any of the expanded playlists had shuffleOwn === true.
  anyPlaylistShuffleForced: boolean;
  // True if any of the expanded playlists had shuffleOwn === false.
  anyPlaylistShuffleDisabled: boolean;
}

export async function resolveVideoFiles(stream: {
  sourceType: string;
  sourcePath?: string | null;
  sourceFileIds?: string | null;
  playlistSourceIds?: string | null;
}): Promise<ResolvedVideoSource> {
  // Local folder mode
  if (stream.sourceType === "local" && stream.sourcePath) {
    const fs = await import("fs/promises");
    const path = await import("path");
    try {
      const entries = await fs.readdir(stream.sourcePath);
      const videoFiles = entries
        .filter((f) => VIDEO_EXTS.some((ext) => f.toLowerCase().endsWith(ext)))
        .map((f) => path.join(stream.sourcePath!, f));
      return {
        videoFiles,
        individualCount: videoFiles.length,
        playlistCount: 0,
        playlistExpandedCount: 0,
        anyPlaylistShuffleForced: false,
        anyPlaylistShuffleDisabled: false,
      };
    } catch {
      return {
        videoFiles: [],
        individualCount: 0,
        playlistCount: 0,
        playlistExpandedCount: 0,
        anyPlaylistShuffleForced: false,
        anyPlaylistShuffleDisabled: false,
      };
    }
  }

  const result: ResolvedVideoSource = {
    videoFiles: [],
    individualCount: 0,
    playlistCount: 0,
    playlistExpandedCount: 0,
    anyPlaylistShuffleForced: false,
    anyPlaylistShuffleDisabled: false,
  };

  const seenFileIds = new Set<string>();
  const addFile = (file: { id: string; storagePath?: string | null }) => {
    if (!file.storagePath) return;
    if (seenFileIds.has(file.id)) return;
    seenFileIds.add(file.id);
    result.videoFiles.push(file.storagePath);
  };

  // === Individual file IDs ===
  if (stream.sourceFileIds) {
    try {
      const fileIds: string[] = JSON.parse(stream.sourceFileIds);
      if (fileIds.length > 0) {
        const files = await db.uploadedFile.findMany({
          where: { id: { in: fileIds } },
          select: { id: true, storagePath: true },
        });
        // Preserve the user's chosen order
        const byId = new Map(files.map((f) => [f.id, f]));
        for (const fid of fileIds) {
          const f = byId.get(fid);
          if (f) {
            addFile(f);
            result.individualCount++;
          }
        }
      }
    } catch (err) {
      console.warn("[resolveVideoFiles] Failed to parse sourceFileIds:", err);
    }
  }

  // === Playlist expansion ===
  if (stream.playlistSourceIds) {
    try {
      const playlistIds: string[] = JSON.parse(stream.playlistSourceIds);
      if (playlistIds.length > 0) {
        // Fetch playlists with their items in sortOrder, including the file
        const playlists = await db.playlist.findMany({
          where: { id: { in: playlistIds } },
          include: {
            items: {
              orderBy: { sortOrder: "asc" },
              include: {
                file: {
                  select: { id: true, storagePath: true },
                },
              },
            },
          },
        });

        // Preserve the user's chosen playlist order
        const byId = new Map(playlists.map((p) => [p.id, p]));
        for (const pid of playlistIds) {
          const p = byId.get(pid);
          if (!p) continue;
          result.playlistExpandedCount++;

          // Track shuffle overrides
          if (p.shuffleOwn === true) result.anyPlaylistShuffleForced = true;
          if (p.shuffleOwn === false) result.anyPlaylistShuffleDisabled = true;

          for (const item of p.items) {
            if (item.file) {
              addFile(item.file);
              result.playlistCount++;
            }
          }
        }
      }
    } catch (err) {
      console.warn("[resolveVideoFiles] Failed to parse playlistSourceIds:", err);
    }
  }

  return result;
}

// Fisher–Yates shuffle (in place)
export function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Decide whether to shuffle the combined video queue.
 *
 * - If any selected playlist has shuffleOwn === true → shuffle.
 * - Else if any selected playlist has shuffleOwn === false → don't shuffle.
 * - Otherwise, fall back to the stream's own `shuffle` setting.
 */
export function shouldShuffleQueue(
  streamShuffle: boolean,
  resolved: ResolvedVideoSource
): boolean {
  if (resolved.anyPlaylistShuffleForced) return true;
  if (resolved.anyPlaylistShuffleDisabled) return false;
  return streamShuffle;
}
