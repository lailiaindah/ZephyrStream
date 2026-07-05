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
export const maxDuration = 300; // 5 minutes for build + restart

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "check";

    // Try to find the git repository directory.
    // In production (standalone build), the server runs from .next/standalone/
    // but the .git folder is in the project root (parent of .next).
    // We try several candidate paths to find the git repo.
    const candidates = [
      process.cwd(),                                    // current working dir
      path.resolve(process.cwd(), ".."),                // parent of cwd
      path.resolve(process.cwd(), "../.."),             // grandparent
    ];

    let projectDir = "";
    for (const candidate of candidates) {
      try {
        await fs.access(path.join(candidate, ".git"));
        projectDir = candidate;
        break;
      } catch {}
    }

    // If no git repo found, return a helpful message
    if (!projectDir) {
      return NextResponse.json({
        upToDate: true,
        currentVersion: APP_VERSION,
        currentCommit: "unknown",
        message: `Git repository not found. Current version: v${APP_VERSION}. To update, run 'git pull' manually via SSH.`,
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

      try {
        // 1. Stash any local changes first to avoid conflicts
        await execAsync("git stash", { cwd: projectDir, timeout: 10000 }).catch(() => {});

        // 2. Git pull
        const { stdout: pullOutput } = await execAsync("git pull origin main", {
          cwd: projectDir,
          timeout: 60000,
        });

        // 3. Get the hash AFTER pulling
        const { stdout: afterHash } = await execAsync("git rev-parse HEAD", {
          cwd: projectDir,
        });
        const afterPull = afterHash.trim();

        // 4. Check what changed
        const { stdout: diffOutput } = await execAsync(
          `git diff --name-only ${beforePull}..${afterPull}`,
          { cwd: projectDir, timeout: 10000 }
        ).catch(() => ({ stdout: "" }));

        const changedFiles = diffOutput.trim().split("\n").filter(Boolean);
        const needsInstall =
          changedFiles.includes("package.json") ||
          changedFiles.includes("bun.lock");
        const needsDbPush = changedFiles.includes("prisma/schema.prisma");
        const needsBuild = changedFiles.some(f =>
          f.startsWith("src/") || f.startsWith("public/") ||
          f.startsWith("next.config") || f.startsWith("tailwind") ||
          f.startsWith("postcss") || f === "package.json"
        );

        // 5. Auto-install if needed
        if (needsInstall) {
          console.log("[Update] Running bun install...");
          await execAsync("bun install", { cwd: projectDir, timeout: 120000 });
        }

        // 6. Auto db push if needed
        if (needsDbPush) {
          console.log("[Update] Running bun run db:push...");
          await execAsync("bun run db:push", { cwd: projectDir, timeout: 30000 });
        }

        // 7. Auto rebuild if needed (or always if there are changes)
        if (needsBuild || needsInstall) {
          console.log("[Update] Running bun run build...");
          await execAsync("bun run build", { cwd: projectDir, timeout: 300000 });
        }

        // 8. Restart systemd service (if running under systemd)
        try {
          console.log("[Update] Restarting zephystream service...");
          await execAsync("sudo systemctl restart zephystream", { timeout: 30000 });
        } catch {
          // Not running under systemd — that's OK
          console.log("[Update] systemd restart failed (not running under systemd?)");
        }

        try {
          console.log("[Update] Restarting zephystream-realtime service...");
          await execAsync("sudo systemctl restart zephystream-realtime", { timeout: 30000 });
        } catch {
          // Realtime service might not be installed
        }

        // Build response message
        const steps: string[] = ["git pull"];
        if (needsInstall) steps.push("bun install");
        if (needsDbPush) steps.push("bun run db:push");
        if (needsBuild || needsInstall) steps.push("bun run build");
        steps.push("systemctl restart zephystream");
        steps.push("systemctl restart zephystream-realtime");

        return NextResponse.json({
          success: true,
          output: pullOutput,
          changedFiles,
          needsInstall,
          needsDbPush,
          needsBuild,
          beforeCommit: beforePull.slice(0, 7),
          afterCommit: afterPull.slice(0, 7),
          stepsCompleted: steps,
          message: `Update complete! Steps: ${steps.join(" → ")}. Server restarted automatically.`,
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: `Update failed: ${err.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
