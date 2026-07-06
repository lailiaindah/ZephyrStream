#!/bin/bash
# ZephyrStream Docker entrypoint
# Starts both the main app and the realtime service.
# Runs a lightweight SQLite migration to add missing columns.

set -e

echo "[Entrypoint] Starting ZephyrStream..."

# === SQLite column migration ===
# The Prisma CLI doesn't work well inside Docker (wasm issues), so we
# run direct SQL to add any missing columns. This is safe — SQLite
# ignores "ADD COLUMN" if the column already exists (we check first).
DB_FILE="/app/db/custom.db"

if [ -f "$DB_FILE" ]; then
  echo "[Entrypoint] Checking database schema..."

  # Add quotaCost column to ActivityLog if it doesn't exist
  HAS_QUOTA=$(sqlite3 "$DB_FILE" "PRAGMA table_info(ActivityLog);" 2>/dev/null | grep -c "quotaCost" || echo "0")
  if [ "$HAS_QUOTA" = "0" ]; then
    echo "[Entrypoint] Adding quotaCost column to ActivityLog..."
    sqlite3 "$DB_FILE" "ALTER TABLE ActivityLog ADD COLUMN quotaCost INTEGER NOT NULL DEFAULT 0;" 2>/dev/null || true
    echo "[Entrypoint] quotaCost column added."
  else
    echo "[Entrypoint] quotaCost column already exists."
  fi

  # Add playlistSourceIds column to Stream if it doesn't exist
  HAS_PLAYLIST=$(sqlite3 "$DB_FILE" "PRAGMA table_info(Stream);" 2>/dev/null | grep -c "playlistSourceIds" || echo "0")
  if [ "$HAS_PLAYLIST" = "0" ]; then
    echo "[Entrypoint] Adding playlistSourceIds column to Stream..."
    sqlite3 "$DB_FILE" "ALTER TABLE Stream ADD COLUMN playlistSourceIds TEXT;" 2>/dev/null || true
    echo "[Entrypoint] playlistSourceIds column added."
  fi

  # Add shuffleTitle column to Stream if it doesn't exist
  HAS_SHUFFLE_TITLE=$(sqlite3 "$DB_FILE" "PRAGMA table_info(Stream);" 2>/dev/null | grep -c "shuffleTitle" || echo "0")
  if [ "$HAS_SHUFFLE_TITLE" = "0" ]; then
    echo "[Entrypoint] Adding shuffleTitle column to Stream..."
    sqlite3 "$DB_FILE" "ALTER TABLE Stream ADD COLUMN shuffleTitle BOOLEAN NOT NULL DEFAULT 0;" 2>/dev/null || true
    echo "[Entrypoint] shuffleTitle column added."
  fi

  # Add shuffleThumbnail column to Stream if it doesn't exist
  HAS_SHUFFLE_THUMB=$(sqlite3 "$DB_FILE" "PRAGMA table_info(Stream);" 2>/dev/null | grep -c "shuffleThumbnail" || echo "0")
  if [ "$HAS_SHUFFLE_THUMB" = "0" ]; then
    echo "[Entrypoint] Adding shuffleThumbnail column to Stream..."
    sqlite3 "$DB_FILE" "ALTER TABLE Stream ADD COLUMN shuffleThumbnail BOOLEAN NOT NULL DEFAULT 0;" 2>/dev/null || true
    echo "[Entrypoint] shuffleThumbnail column added."
  fi

  echo "[Entrypoint] Database schema check complete."
fi

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
