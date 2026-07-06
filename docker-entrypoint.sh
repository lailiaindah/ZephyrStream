#!/bin/bash
# ZephyrStream Docker entrypoint
# Runs DB migration + starts both the main app and the realtime service.

set -e

echo "[Entrypoint] Starting ZephyrStream..."

# === Database migration ===
# Ensure the database schema is up-to-date. This is critical — without it,
# new columns like quotaCost won't exist and the app will crash.
echo "[Entrypoint] Running database migration..."
cd /app

# Run prisma db push directly (not via bun run) for reliability
# The DATABASE_URL env var tells Prisma where the DB is
node_modules/.bin/prisma db push --accept-data-loss 2>&1 || {
  echo "[Entrypoint] WARNING: prisma db push failed. Trying bun run db:push..."
  bun run db:push 2>&1 || echo "[Entrypoint] DB migration failed — app may not work correctly"
}

echo "[Entrypoint] Database migration complete."

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
