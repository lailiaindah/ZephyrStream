#!/bin/bash
# ZephyrStream — Systemd Service Installer
# Usage: sudo bash deploy/install-services.sh
set -e

CURRENT_USER=$(whoami)
PROJECT_DIR="/home/z/my-project"
BUN_PATH=$(which bun 2>/dev/null || echo "/home/$CURRENT_USER/.bun/bin/bun")

if [ "$EUID" -eq 0 ]; then
  echo "⚠️  Do not run as root. Run as: sudo -u \$(whoami) bash deploy/install-services.sh"
  exit 1
fi

if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ Project directory not found: $PROJECT_DIR"
  echo "   Edit PROJECT_DIR in this script to match your path."
  exit 1
fi

if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "❌ .env not found. Run 'cp .env.example .env' and configure it first."
  exit 1
fi

if [ ! -d "$PROJECT_DIR/.next/standalone" ]; then
  echo "⚠️  Production build not found. Building..."
  cd "$PROJECT_DIR" && bun run build
fi

echo "═══════════════════════════════════════════════════"
echo "  ZephyrStream Systemd Service Installer"
echo "═══════════════════════════════════════════════════"
echo "  User: $CURRENT_USER  |  Dir: $PROJECT_DIR  |  Bun: $BUN_PATH"
echo ""

MAIN_SERVICE=$(cat deploy/zephystream.service | \
  sed "s|__USER__|$CURRENT_USER|g" | \
  sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" | \
  sed "s|__BUN_PATH__|$BUN_PATH|g")

RT_SERVICE=$(cat deploy/zephystream-realtime.service | \
  sed "s|__USER__|$CURRENT_USER|g" | \
  sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" | \
  sed "s|__BUN_PATH__|$BUN_PATH|g")

echo "$MAIN_SERVICE" > /tmp/zephystream.service
echo "$RT_SERVICE" > /tmp/zephystream-realtime.service

echo "📦 Installing service files..."
sudo cp /tmp/zephystream.service /etc/systemd/system/zephystream.service
sudo cp /tmp/zephystream-realtime.service /etc/systemd/system/zephystream-realtime.service
sudo chown root:root /etc/systemd/system/zephystream.service /etc/systemd/system/zephystream-realtime.service
sudo systemctl daemon-reload

echo "🔧 Enabling auto-start on boot..."
sudo systemctl enable zephystream zephystream-realtime

echo "🚀 Starting services..."
sudo systemctl start zephystream
sleep 2
sudo systemctl start zephystream-realtime

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Done! Services auto-start on boot."
echo ""
echo "  Commands:"
echo "    sudo systemctl status zephystream"
echo "    sudo systemctl restart zephystream"
echo "    sudo journalctl -u zephystream -f"
echo "═══════════════════════════════════════════════════"
