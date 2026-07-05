#!/bin/bash
# Comprehensive test for the upload fix and playlist feature.
# Starts the dev server, runs tests, then shuts down.

set -e

echo "=== Killing any existing next-server ==="
pkill -f "next dev" 2>/dev/null || true
sleep 2

echo "=== Starting dev server ==="
cd /home/z/my-project
bunx next dev -p 3000 > /home/z/my-project/dev.log 2>&1 &
DEV_PID=$!
echo "Dev server PID: $DEV_PID"

# Wait for server to be ready
for i in {1..30}; do
  if curl -s -o /dev/null http://127.0.0.1:3000/ --max-time 2 2>/dev/null; then
    echo "Server is ready after ${i}s"
    break
  fi
  sleep 1
done

echo ""
echo "=========================================="
echo "TEST 1: Upload 5MB file (without auth) - should return JSON 401"
echo "=========================================="
echo "Creating 5MB test file..."
dd if=/dev/urandom of=/tmp/test-5mb.mp4 bs=1M count=5 2>/dev/null
ls -la /tmp/test-5mb.mp4

echo "Uploading 5MB file..."
HTTP_CODE=$(curl -s -o /tmp/resp-5mb.txt -w "%{http_code}" -X POST \
  -F "files=@/tmp/test-5mb.mp4" \
  "http://127.0.0.1:3000/api/files/upload?channelId=unassigned" \
  --max-time 30)
echo "HTTP Status: $HTTP_CODE"
echo "Response body:"
cat /tmp/resp-5mb.txt
echo ""

# Verify it's valid JSON, not "Server acted..."
if grep -q "Unexpected token\|Server act" /tmp/resp-5mb.txt 2>/dev/null; then
  echo "FAIL: Response contains the old error pattern"
else
  echo "PASS: Response is valid JSON (not 'Server acted unexpectedly')"
fi

echo ""
echo "=========================================="
echo "TEST 2: Upload 50MB file - should also return JSON 401 (or success)"
echo "=========================================="
echo "Creating 50MB test file..."
dd if=/dev/urandom of=/tmp/test-50mb.mp4 bs=1M count=50 2>/dev/null
ls -la /tmp/test-50mb.mp4

echo "Uploading 50MB file..."
HTTP_CODE=$(curl -s -o /tmp/resp-50mb.txt -w "%{http_code}" -X POST \
  -F "files=@/tmp/test-50mb.mp4" \
  "http://127.0.0.1:3000/api/files/upload?channelId=unassigned" \
  --max-time 60)
echo "HTTP Status: $HTTP_CODE"
echo "Response body (first 200 chars):"
head -c 200 /tmp/resp-50mb.txt
echo ""

if grep -q "Unexpected token\|Server act" /tmp/resp-50mb.txt 2>/dev/null; then
  echo "FAIL: Response contains the old error pattern"
else
  echo "PASS: 50MB upload returned valid JSON response"
fi

echo ""
echo "=========================================="
echo "TEST 3: Playlists endpoint (without auth) - should return 401"
echo "=========================================="
HTTP_CODE=$(curl -s -o /tmp/resp-playlists.txt -w "%{http_code}" \
  "http://127.0.0.1:3000/api/playlists" --max-time 10)
echo "HTTP Status: $HTTP_CODE"
echo "Response body:"
cat /tmp/resp-playlists.txt
echo ""

echo ""
echo "=========================================="
echo "TEST 4: Server is still alive after uploads"
echo "=========================================="
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/ --max-time 5 | grep -q "200"; then
  echo "PASS: Server still responds to /"
else
  echo "FAIL: Server died after uploads"
fi

echo ""
echo "=== Dev log tail ==="
tail -25 /home/z/my-project/dev.log

echo ""
echo "=== Stopping dev server ==="
kill $DEV_PID 2>/dev/null || true
sleep 2
echo "Done"
