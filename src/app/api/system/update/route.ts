// POST /api/system/update — Check for updates from GitHub and pull if available
// Runs `git fetch` + compares local vs remote, then `git pull` if behind.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
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

    // Only admins (or the owner) can run updates — but for self-hosted single-user
    // deployments we allow any authenticated user.
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
            message: "You are running the latest version",
          });
        }

        // Get commit log of what's new
        const { stdout: log } = await execAsync(
          `git log --oneline ${local}..${remote}`,
          { cwd: projectDir, timeout: 10000 }
        );

        return NextResponse.json({
          upToDate: false,
          local,
          remote,
          newCommits: log.trim().split("\n").filter(Boolean),
          message: `${log.trim().split("\n").filter(Boolean).length} new commit(s) available`,
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: `Failed to check for updates: ${err.message}` },
          { status: 500 }
        );
      }
    }

    if (action === "pull") {
      // Perform the actual git pull
      try {
        // Stash any local changes first to avoid conflicts
        await execAsync("git stash", { cwd: projectDir, timeout: 10000 }).catch(() => {});

        const { stdout: pullOutput } = await execAsync("git pull origin main", {
          cwd: projectDir,
          timeout: 60000,
        });

        // Check if package.json changed → need install
        const { stdout: diffOutput } = await execAsync(
          "git diff HEAD~1 HEAD --name-only",
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
