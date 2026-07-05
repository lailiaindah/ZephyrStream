#!/bin/bash
# ZephyrStream — Systemd Service Installer
# Usage: bash deploy/install-services.sh
#
# This script auto-detects the project directory (where this script is located).
# Run it WITHOUT sudo — it will use sudo internally only for systemctl commands.

set -e

# Auto-detect project directory from script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CURRENT_USER=$(whoami)
BUN_PATH=$(which bun 2>/dev/null || echo "/home/$CURRENT_USER/.bun/bin/bun")

echo "═══════════════════════════════════════════════════"
echo "  ZephyrStream Systemd Service Installer"
echo "═══════════════════════════════════════════════════"
echo "  User:        $CURRENT_USER"
echo "  Project dir: $PROJECT_DIR"
echo "  Bun path:    $BUN_PATH"
echo ""

# Verify project directory
if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo "❌ Project directory not found or invalid: $PROJECT_DIR"
  echo "   Make sure you're running this from the project's deploy/ folder."
  exit 1
fi

# Verify .env exists
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "❌ .env file not found at $PROJECT_DIR/.env"
  echo "   Run: cp .env.example .env && edit it"
  exit 1
fi

# Check if bun exists
if [ ! -f "$BUN_PATH" ]; then
  echo "❌ bun not found. Install bun first:"
  echo "   curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

# Build if standalone doesn't exist
if [ ! -d "$PROJECT_DIR/.next/standalone" ]; then
  echo "⚠️  Production build not found. Building..."
  cd "$PROJECT_DIR"
  bun run build
  cd "$PROJECT_DIR"
fi

# Generate service files with substituted values
echo "📝 Generating service files..."

MAIN_SERVICE=$(cat "$PROJECT_DIR/deploy/zephystream.service" | \
  sed "s|__USER__|$CURRENT_USER|g" | \
  sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" | \
  sed "s|__BUN_PATH__|$BUN_PATH|g")

RT_SERVICE=$(cat "$PROJECT_DIR/deploy/zephystream-realtime.service" | \
  sed "s|__USER__|$CURRENT_USER|g" | \
  sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" | \
  sed "s|__BUN_PATH__|$BUN_PATH|g")

echo "$MAIN_SERVICE" > /tmp/zephystream.service
echo "$RT_SERVICE" > /tmp/zephystream-realtime.service

# Install service files (requires sudo)
echo "📦 Installing service files to /etc/systemd/system/..."
sudo cp /tmp/zephystream.service /etc/systemd/system/zephystream.service
sudo cp /tmp/zephystream-realtime.service /etc/systemd/system/zephystream-realtime.service
sudo chown root:root /etc/systemd/system/zephystream.service /etc/systemd/system/zephystream-realtime.service
sudo systemctl daemon-reload

# Enable services (auto-start on boot)
echo "🔧 Enabling auto-start on boot..."
sudo systemctl enable zephystream zephystream-realtime

# Start services
echo "🚀 Starting services..."
sudo systemctl start zephystream
sleep 2
sudo systemctl start zephystream-realtime

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Installation Complete!"
echo ""
echo "  Services auto-start on VPS boot."
echo "  PuTTY can be closed — server stays running."
echo ""
echo "  Commands:"
echo "    sudo systemctl status zephystream"
echo "    sudo systemctl status zephystream-realtime"
echo "    sudo systemctl restart zephystream"
echo "    sudo journalctl -u zephystream -f"
echo "═══════════════════════════════════════════════════"
