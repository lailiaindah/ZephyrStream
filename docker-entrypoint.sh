#!/bin/bash
# ZephyrStream Docker entrypoint
# Starts both the main app and the realtime service.
# Runs a lightweight SQLite migration to add missing columns.

set -e

echo "[Entrypoint] Starting ZephyrStream..."

# === SQLite column migration ===
# The Prisma CLI doesn't work inside Docker (wasm issues), so we
# run direct SQL to add any missing columns. This is safe — we check
# if the column exists before adding it.
DB_FILE="/app/db/custom.db"

if [ -f "$DB_FILE" ]; then
  echo "[Entrypoint] Checking database schema..."

  # Check if ActivityLog table exists first
  HAS_TABLE=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='ActivityLog';" 2>/dev/null || echo "0")

  if [ "$HAS_TABLE" -gt 0 ] 2>/dev/null; then
    # Check if quotaCost column exists (grep -c outputs count, but exits 1 if 0 matches)
    # Use SELECT count(*) instead for reliable detection
    HAS_QUOTA=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM pragma_table_info('ActivityLog') WHERE name='quotaCost';" 2>/dev/null || echo "0")
    if [ "$HAS_QUOTA" = "0" ]; then
      echo "[Entrypoint] Adding quotaCost column to ActivityLog..."
      sqlite3 "$DB_FILE" "ALTER TABLE ActivityLog ADD COLUMN quotaCost INTEGER NOT NULL DEFAULT 0;" 2>/dev/null || true
      echo "[Entrypoint] quotaCost column added."
    else
      echo "[Entrypoint] quotaCost column already exists."
    fi
  else
    echo "[Entrypoint] ActivityLog table not found — fresh DB, will be auto-created by Prisma."
  fi

  # Check if Stream table exists
  HAS_STREAM_TABLE=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='Stream';" 2>/dev/null || echo "0")

  if [ "$HAS_STREAM_TABLE" -gt 0 ] 2>/dev/null; then
    # Add playlistSourceIds if missing
    HAS_PLAYLIST=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM pragma_table_info('Stream') WHERE name='playlistSourceIds';" 2>/dev/null || echo "0")
    if [ "$HAS_PLAYLIST" = "0" ]; then
      echo "[Entrypoint] Adding playlistSourceIds column to Stream..."
      sqlite3 "$DB_FILE" "ALTER TABLE Stream ADD COLUMN playlistSourceIds TEXT;" 2>/dev/null || true
      echo "[Entrypoint] playlistSourceIds column added."
    fi

    # Add shuffleTitle if missing
    HAS_SHUFFLE_TITLE=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM pragma_table_info('Stream') WHERE name='shuffleTitle';" 2>/dev/null || echo "0")
    if [ "$HAS_SHUFFLE_TITLE" = "0" ]; then
      echo "[Entrypoint] Adding shuffleTitle column to Stream..."
      sqlite3 "$DB_FILE" "ALTER TABLE Stream ADD COLUMN shuffleTitle BOOLEAN NOT NULL DEFAULT 0;" 2>/dev/null || true
      echo "[Entrypoint] shuffleTitle column added."
    fi

    # Add shuffleThumbnail if missing
    HAS_SHUFFLE_THUMB=$(sqlite3 "$DB_FILE" "SELECT count(*) FROM pragma_table_info('Stream') WHERE name='shuffleThumbnail';" 2>/dev/null || echo "0")
    if [ "$HAS_SHUFFLE_THUMB" = "0" ]; then
      echo "[Entrypoint] Adding shuffleThumbnail column to Stream..."
      sqlite3 "$DB_FILE" "ALTER TABLE Stream ADD COLUMN shuffleThumbnail BOOLEAN NOT NULL DEFAULT 0;" 2>/dev/null || true
      echo "[Entrypoint] shuffleThumbnail column added."
    fi
  else
    echo "[Entrypoint] Stream table not found — fresh DB, will be auto-created by Prisma."
  fi

  echo "[Entrypoint] Database schema check complete."
else
  echo "[Entrypoint] No database file found — will be auto-created by Prisma on first request."
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
