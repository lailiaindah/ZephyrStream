#!/bin/bash
# ZephyrStream Docker entrypoint
# Runs DB migration + starts both the main app and the realtime service.

set -e

echo "[Entrypoint] Starting ZephyrStream..."

# === Database migration ===
# Ensure the database schema is up-to-date. This is safe to run on every
# startup — prisma db push is idempotent (only applies changes, doesn't
# drop data unless a column type changed).
echo "[Entrypoint] Running database migration..."
cd /app
bun run db:push 2>/dev/null || echo "[Entrypoint] DB migration skipped (or already up-to-date)"

# === Start realtime service ===
echo "[Entrypoint] Starting realtime service on port 3003..."
cd /app/mini-services/realtime
bun index.ts &
REALTIME_PID=$!
echo "[Entrypoint] Realtime service started (PID: $REALTIME_PID)"

# === Start main app ===
echo "[Entrypoint] Starting ZephyrStream main app on port 3000..."
cd /app
exec bun server.js
