// POST /api/system/update — Check for updates from GitHub (read-only).
// This endpoint ONLY fetches the remote and compares commits. It does NOT
// run `git pull`, `bun install`, `bun run build`, or restart any service.
// The user is expected to SSH into the VPS and run those commands manually
// after seeing that an update is available.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { APP_VERSION } from "@/lib/constants";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // 1 minute is plenty for `git fetch` + `git log`

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // This endpoint now ONLY checks for updates. The previous "pull" action
    // has been removed — pulling/installing/building/restarting must be done
    // manually by the admin over SSH. This is safer and avoids the risk of
    // a long-running task (build + restart) silently timing out or breaking
    // the running server.
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "check";

    if (action !== "check") {
      return NextResponse.json(
        {
          error:
            "Only 'check' is supported. To update, SSH into the VPS and run: " +
            "git pull && bun install && bun run db:push && bun run build && sudo systemctl restart zephystream zephystream-realtime",
        },
        { status: 400 }
      );
    }

    // Try to find the git repository directory.
    // In production (standalone build), the server runs from .next/standalone/
    // but the .git folder is in the project root (parent of .next).
    const candidates = [
      process.cwd(),
      path.resolve(process.cwd(), ".."),
      path.resolve(process.cwd(), "../.."),
    ];

    let projectDir = "";
    for (const candidate of candidates) {
      try {
        await fs.access(path.join(candidate, ".git"));
        projectDir = candidate;
        break;
      } catch {}
    }

    if (!projectDir) {
      return NextResponse.json({
        upToDate: true,
        currentVersion: APP_VERSION,
        currentCommit: "unknown",
        message: `Git repository not found. Current version: v${APP_VERSION}. To update, SSH into the VPS and run 'git pull' manually.`,
      });
    }

    // Get current commit hash (short) for display
    let currentCommit = "";
    try {
      const { stdout } = await execAsync("git rev-parse --short HEAD", {
        cwd: projectDir,
      });
      currentCommit = stdout.trim();
    } catch {}

    // Check for updates: fetch remote, compare local vs origin/main
    try {
      await execAsync("git fetch origin main", { cwd: projectDir, timeout: 30000 });

      const { stdout: localHash } = await execAsync("git rev-parse HEAD", {
        cwd: projectDir,
      });
      const { stdout: remoteHash } = await execAsync("git rev-parse origin/main", {
        cwd: projectDir,
      });

      const local = localHash.trim();
      const remote = remoteHash.trim();

      if (local === remote) {
        return NextResponse.json({
          upToDate: true,
          local,
          remote,
          currentVersion: APP_VERSION,
          currentCommit,
          message: `You are running the latest version (v${APP_VERSION}, commit ${currentCommit})`,
        });
      }

      // Get commit log of what's new
      const { stdout: log } = await execAsync(
        `git log --oneline ${local}..${remote}`,
        { cwd: projectDir, timeout: 10000 }
      );

      const newCommits = log.trim().split("\n").filter(Boolean);

      // Try to extract the latest version tag from remote commits
      let remoteVersion = null;
      try {
        const { stdout: tagOutput } = await execAsync(
          `git describe --tags origin/main 2>/dev/null || echo ""`,
          { cwd: projectDir, timeout: 5000 }
        );
        remoteVersion = tagOutput.trim() || null;
      } catch {}

      return NextResponse.json({
        upToDate: false,
        local,
        remote,
        currentVersion: APP_VERSION,
        currentCommit,
        remoteVersion,
        newCommits,
        message: `${newCommits.length} new commit(s) available — SSH into the VPS to update`,
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: `Failed to check for updates: ${err.message}` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
