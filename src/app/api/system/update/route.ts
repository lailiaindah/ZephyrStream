// POST /api/system/update — Check for updates from GitHub and pull if available
// Runs `git fetch` + compares local vs remote, then `git pull` if behind.
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
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "check";

    const projectDir = "/home/z/my-project";

    // Verify it's a git repo
    try {
      await fs.access(path.join(projectDir, ".git"));
    } catch {
      return NextResponse.json(
        { error: "Project directory is not a git repository" },
        { status: 400 }
      );
    }

    // Get current commit hash (short) for display
    let currentCommit = "";
    try {
      const { stdout } = await execAsync("git rev-parse --short HEAD", {
        cwd: projectDir,
      });
      currentCommit = stdout.trim();
    } catch {}

    if (action === "check") {
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
          message: `${newCommits.length} new commit(s) available — click to update`,
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: `Failed to check for updates: ${err.message}` },
          { status: 500 }
        );
      }
    }

    if (action === "pull") {
      // Record the hash BEFORE pulling so we can compare the full range
      const { stdout: beforeHash } = await execAsync("git rev-parse HEAD", {
        cwd: projectDir,
      }).catch(() => ({ stdout: "" }));
      const beforePull = beforeHash.trim();

      // Perform the actual git pull
      try {
        // Stash any local changes first to avoid conflicts
        await execAsync("git stash", { cwd: projectDir, timeout: 10000 }).catch(() => {});

        const { stdout: pullOutput } = await execAsync("git pull origin main", {
          cwd: projectDir,
          timeout: 60000,
        });

        // Get the hash AFTER pulling
        const { stdout: afterHash } = await execAsync("git rev-parse HEAD", {
          cwd: projectDir,
        });
        const afterPull = afterHash.trim();

        // Compare the full range (before..after) instead of just HEAD~1..HEAD
        // This correctly detects all changed files when multiple commits are pulled
        const { stdout: diffOutput } = await execAsync(
          `git diff --name-only ${beforePull}..${afterPull}`,
          { cwd: projectDir, timeout: 10000 }
        ).catch(() => ({ stdout: "" }));

        const changedFiles = diffOutput.trim().split("\n").filter(Boolean);
        const needsInstall =
          changedFiles.includes("package.json") ||
          changedFiles.includes("bun.lock");
        const needsDbPush = changedFiles.includes("prisma/schema.prisma");

        return NextResponse.json({
          success: true,
          output: pullOutput,
          changedFiles,
          needsInstall,
          needsDbPush,
          beforeCommit: beforePull.slice(0, 7),
          afterCommit: afterPull.slice(0, 7),
          message: needsInstall || needsDbPush
            ? "Update pulled. Run `bun install` and `bun run db:push`, then restart the server."
            : "Update pulled successfully. Restart the server to apply changes.",
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: `git pull failed: ${err.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
