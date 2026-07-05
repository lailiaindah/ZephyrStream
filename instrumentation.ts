// Next.js instrumentation hook — runs once on server startup (before any
// request is handled). This is the correct place to start the scheduler
// so it runs immediately on boot, not only when a user logs in.
//
// Without this, the scheduler only starts when a logged-in user visits
// the page (via the SchedulerBootstrap component). If the server reboots
// overnight, scheduled streams are silently missed until someone logs in.
//
// See: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  // Only run on the server (not during build)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./src/lib/scheduler");
    startScheduler();
    console.log("[Instrumentation] Scheduler started on server boot");

    // Add global error handlers so unhandled rejections don't crash
    // the server silently. Log them but don't exit — the scheduler
    // should keep running even if one tick has an unhandled error.
    process.on("unhandledRejection", (reason, promise) => {
      console.error("[Unhandled Rejection]", reason);
    });
    process.on("uncaughtException", (err) => {
      console.error("[Uncaught Exception]", err);
      // Don't exit — the scheduler and active streams depend on this process.
      // In production with systemd, systemd will restart us if we do crash.
    });
  }
}
