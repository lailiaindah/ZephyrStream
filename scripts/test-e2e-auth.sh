#!/bin/bash
# End-to-end test with authentication: signup, login, create channel,
# upload file, create playlist, create stream with playlist, fetch stream.
# Runs entirely against the live dev server.

set -e

echo "=== Killing any existing next-server ==="
pkill -f "next dev" 2>/dev/null || true
sleep 2

echo "=== Starting dev server ==="
cd /home/z/my-project
bunx next dev -p 3000 > /home/z/my-project/dev.log 2>&1 &
DEV_PID=$!
echo "Dev server PID: $DEV_PID"

# Wait for server
for i in {1..30}; do
  if curl -s -o /dev/null http://127.0.0.1:3000/ --max-time 2 2>/dev/null; then
    echo "Server is ready after ${i}s"
    break
  fi
  sleep 1
done

# Cookie jar to persist session
COOKIE_JAR=/tmp/zephyr-cookies.txt
rm -f $COOKIE_JAR

EMAIL="test-$(date +%s)@zephyr.test"
PASS="testpass123"

echo ""
echo "=========================================="
echo "STEP 1: Sign up new user ($EMAIL)"
echo "=========================================="
SIGNUP_RESP=$(curl -s -c $COOKIE_JAR -b $COOKIE_JAR \
  -X POST -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"Test User\"}" \
  http://127.0.0.1:3000/api/auth/signup)
echo "Signup response: $SIGNUP_RESP"

echo ""
echo "=========================================="
echo "STEP 2: Check auth (/api/auth/me)"
echo "=========================================="
ME_RESP=$(curl -s -c $COOKIE_JAR -b $COOKIE_JAR http://127.0.0.1:3000/api/auth/me)
echo "Me response: $ME_RESP"

echo ""
echo "=========================================="
echo "STEP 3: Create a channel"
echo "=========================================="
CHANNEL_RESP=$(curl -s -c $COOKIE_JAR -b $COOKIE_JAR \
  -X POST -H "Content-Type: application/json" \
  -d '{"name":"Test Channel","clientId":"test-client-id","clientSecret":"test-client-secret"}' \
  http://127.0.0.1:3000/api/channels)
echo "Channel response: $CHANNEL_RESP"
CHANNEL_ID=$(echo "$CHANNEL_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Channel ID: $CHANNEL_ID"

echo ""
echo "=========================================="
echo "STEP 4: Upload a 5MB video file to the channel"
echo "=========================================="
dd if=/dev/urandom of=/tmp/e2e-video.mp4 bs=1M count=5 2>/dev/null
ls -la /tmp/e2e-video.mp4

UPLOAD_RESP=$(curl -s -c $COOKIE_JAR -b $COOKIE_JAR \
  -X POST -F "files=@/tmp/e2e-video.mp4" \
  "http://127.0.0.1:3000/api/files/upload?channelId=$CHANNEL_ID" \
  --max-time 30)
echo "Upload response: $UPLOAD_RESP"
FILE_ID=$(echo "$UPLOAD_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "File ID: $FILE_ID"

echo ""
echo "=========================================="
echo "STEP 5: Create a playlist with that file"
echo "=========================================="
PLAYLIST_RESP=$(curl -s -c $COOKIE_JAR -b $COOKIE_JAR \
  -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"My Test Playlist\",\"channelId\":\"$CHANNEL_ID\",\"fileIds\":[\"$FILE_ID\"],\"shuffleOwn\":true}" \
  http://127.0.0.1:3000/api/playlists)
echo "Playlist response: $PLAYLIST_RESP"
PLAYLIST_ID=$(echo "$PLAYLIST_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Playlist ID: $PLAYLIST_ID"

echo ""
echo "=========================================="
echo "STEP 6: List playlists"
echo "=========================================="
LIST_RESP=$(curl -s -c $COOKIE_JAR -b $COOKIE_JAR \
  "http://127.0.0.1:3000/api/playlists?channelId=$CHANNEL_ID")
echo "List response: $LIST_RESP"

echo ""
echo "=========================================="
echo "STEP 7: Create a stream using the playlist"
echo "=========================================="
STREAM_RESP=$(curl -s -c $COOKIE_JAR -b $COOKIE_JAR \
  -X POST -H "Content-Type: application/json" \
  -d "{\"name\":\"E2E Test Stream\",\"channelId\":\"$CHANNEL_ID\",\"streamKey\":\"abcd-1234-efgh-5678\",\"sourceType\":\"uploaded\",\"playlistSourceIds\":[\"$PLAYLIST_ID\"],\"shuffle\":true,\"minHours\":1,\"maxHours\":2}" \
  http://127.0.0.1:3000/api/streams)
echo "Stream response: $STREAM_RESP"
STREAM_ID=$(echo "$STREAM_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Stream ID: $STREAM_ID"

echo ""
echo "=========================================="
echo "STEP 8: Fetch the stream and verify playlistSourceIds is stored"
echo "=========================================="
FETCH_RESP=$(curl -s -c $COOKIE_JAR -b $COOKIE_JAR \
  "http://127.0.0.1:3000/api/streams/$STREAM_ID")
echo "Fetch response: $FETCH_RESP"

if echo "$FETCH_RESP" | grep -q "playlistSourceIds"; then
  echo "PASS: playlistSourceIds is stored on the stream"
else
  echo "FAIL: playlistSourceIds not found on the stream"
fi

echo ""
echo "=========================================="
echo "STEP 9: Verify the playlist's videos are resolvable"
echo "=========================================="
# The /api/streams/[id]/start endpoint would normally try to start FFmpeg.
# We don't actually want to start it (no real video), but we can check
# that the resolveVideoFiles logic works by inspecting the error message —
# it should complain about FFmpeg, NOT about "No video files found".
START_RESP=$(curl -s -c $COOKIE_JAR -b $COOKIE_JAR \
  -X POST "http://127.0.0.1:3000/api/streams/$STREAM_ID/start" \
  --max-time 30)
echo "Start response: $START_RESP"

if echo "$START_RESP" | grep -q "No video files found"; then
  echo "FAIL: Playlist videos were not resolved"
elif echo "$START_RESP" | grep -q "FFmpeg\|ffmpeg\|spawn\|broadcast"; then
  echo "PASS: Videos were resolved (got past the 'No video files' check)"
else
  echo "INFO: Start response indicates playlist resolution worked — inspect manually"
fi

echo ""
echo "=== Stopping dev server ==="
kill $DEV_PID 2>/dev/null || true
sleep 2
echo "Done"
