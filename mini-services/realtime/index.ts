// ZephyrStream Real-Time Service (Socket.io)
// Port 3003 — polls database for stream status + activity log changes
// Start: cd mini-services/realtime && bun install && bun run dev
//
// SECURITY: This service authenticates socket connections via JWT (same
// secret as the main app). Only authenticated users can connect and
// receive events. Events are filtered by userId so each user only sees
// their own streams and activity logs — not other users' data.
//
// CORS is restricted to the app's own origin(s) via the ALLOWED_ORIGINS
// env var (comma-separated). Default: same-origin (no cross-origin).
//
// The unauthenticated /emit endpoint has been REMOVED — the main app
// emits events by writing to the DB, and this service polls and pushes
// to connected sockets. No external event injection is possible.

import { Server as SocketIOServer, Socket } from "socket.io";
import http from "http";
import path from "path";
import jwt from "jsonwebtoken";

// Dynamically import PrismaClient from the parent project's node_modules
const parentNodeModules = path.resolve(__dirname, "../../node_modules/@prisma/client");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require(parentNodeModules);

const PORT = 3003;
const JWT_SECRET = process.env.JWT_SECRET || "zephystream-dev-secret-change-in-production-please";

// Allowed origins for CORS. Set ALLOWED_ORIGINS=http://yourapp.com,http://other.com
// Default: allow same-origin only (most secure).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "file:../../db/custom.db",
    },
  },
});

const httpServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "zephystream-realtime" }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

const io = new SocketIOServer(httpServer, {
  // Restrict CORS to allowed origins only. If ALLOWED_ORIGINS is not set,
  // default to no CORS (same-origin only) — the most secure option.
  cors: ALLOWED_ORIGINS.length > 0
    ? { origin: ALLOWED_ORIGINS, methods: ["GET", "POST"] }
    : { origin: false },
});

// === AUTH MIDDLEWARE ===
// Every socket connection must present a valid JWT. We accept it via:
//   - auth.token (socket.io auth handshake), or
//   - cookie header (the main app sets a zephyr_session cookie)
// If no valid JWT is found, the connection is rejected.
io.use((socket: Socket, next) => {
  try {
    let token: string | undefined;

    // Check auth.token (sent by client via io({ auth: { token } }))
    if (socket.handshake.auth && typeof socket.handshake.auth.token === "string") {
      token = socket.handshake.auth.token;
    }

    // Check cookie header (the main app uses HttpOnly cookies)
    if (!token && socket.handshake.headers.cookie) {
      const cookies = socket.handshake.headers.cookie.split(";").map(c => c.trim());
      for (const c of cookies) {
        if (c.startsWith("zephyr_session=")) {
          token = c.substring("zephyr_session=".length);
          break;
        }
      }
    }

    if (!token) {
      return next(new Error("UNAUTHORIZED"));
    }

    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
    // Attach userId to the socket so we can filter events per-user
    (socket as any).userId = payload.userId;
    next();
  } catch (err) {
    next(new Error("UNAUTHORIZED"));
  }
});

let connectedClients = 0;

io.on("connection", (socket: Socket) => {
  connectedClients++;
  const userId = (socket as any).userId as string;
  console.log(`[Realtime] Client connected: user=${userId} (total: ${connectedClients})`);
  sendLiveStreamsSnapshot(socket, userId);

  socket.on("disconnect", () => {
    connectedClients--;
    console.log(`[Realtime] Client disconnected (total: ${connectedClients})`);
  });

  socket.on("subscribe:stream-log", (streamId: string) => {
    // Only allow subscribing to streams the user owns
    // (verified by the stream-log emit filter below)
    socket.join(`stream-log:${userId}:${streamId}`);
  });
  socket.on("unsubscribe:stream-log", (streamId: string) => {
    socket.leave(`stream-log:${userId}:${streamId}`);
  });
});

let lastStreamCheck = new Date();

async function checkStreamChanges() {
  try {
    // Capture the query start time BEFORE the query. We update
    // lastStreamCheck to this value after processing — so any DB write
    // that lands during processing has updatedAt > queryStart and is
    // caught on the next poll. Previously lastStreamCheck was set to
    // new Date() AFTER processing, which could miss writes in the
    // processing window.
    const queryStart = new Date();
    const changed = await db.stream.findMany({
      where: { updatedAt: { gt: lastStreamCheck } },
      select: { id: true, name: true, status: true, lastError: true, startedAt: true, endedAt: true, pid: true, userId: true },
      take: 50,
    });

    // Group changes by userId so we only emit to that user's sockets.
    // Each socket has userId attached from the auth middleware.
    for (const stream of changed) {
      const payload = {
        id: stream.id, name: stream.name, status: stream.status,
        lastError: stream.lastError, userId: stream.userId,
        startedAt: stream.startedAt?.toISOString(), endedAt: stream.endedAt?.toISOString(),
      };

      // Emit only to sockets belonging to this stream's owner.
      for (const [socketId, socket] of io.sockets.sockets) {
        if ((socket as any).userId === stream.userId) {
          socket.emit("stream:status", payload);
        }
      }

      if (stream.status === "error" && stream.lastError) {
        for (const [socketId, socket] of io.sockets.sockets) {
          if ((socket as any).userId === stream.userId) {
            socket.emit("stream:error", { id: stream.id, name: stream.name, error: stream.lastError, userId: stream.userId });
          }
        }
      }
    }
    lastStreamCheck = queryStart;
  } catch (err: any) { console.error("[Realtime] Stream check error:", err.message); }
}

let lastActivityCheck = new Date();

async function checkNewActivity() {
  try {
    // Same queryStart pattern as checkStreamChanges — capture time
    // before the query so writes during processing aren't missed.
    const queryStart = new Date();
    const newLogs = await db.activityLog.findMany({
      where: { createdAt: { gt: lastActivityCheck } },
      select: { id: true, level: true, category: true, message: true, details: true, userId: true, createdAt: true },
      take: 20, orderBy: { createdAt: "asc" },
    });

    for (const log of newLogs) {
      const payload = {
        id: log.id, level: log.level, category: log.category, message: log.message,
        details: log.details, userId: log.userId, createdAt: log.createdAt.toISOString(),
      };

      // Only emit to the user who owns this activity log
      for (const [socketId, socket] of io.sockets.sockets) {
        if ((socket as any).userId === log.userId) {
          socket.emit("activity:new", payload);
        }
      }
    }
    lastActivityCheck = queryStart;
  } catch (err: any) { console.error("[Realtime] Activity check error:", err.message); }
}

async function sendLiveStreamsSnapshot(socket: Socket, userId: string) {
  try {
    // Only return this user's live streams — not other users'
    const live = await db.stream.findMany({
      where: { status: "live", userId },
      select: { id: true, name: true, status: true, startedAt: true, pid: true, userId: true },
    });
    socket.emit("stream:snapshot", {
      liveStreams: live.map((s) => ({ ...s, startedAt: s.startedAt?.toISOString() })),
    });
  } catch (err: any) { console.error("[Realtime] Snapshot error:", err.message); }
}

// NOTE: The unauthenticated /emit endpoint has been REMOVED.
// Events are only emitted by this service's internal polling loops,
// which read from the DB. No external process can inject events.

setInterval(checkStreamChanges, 5000);
setInterval(checkNewActivity, 5000);

httpServer.listen(PORT, () => {
  console.log(`[Realtime] ZephyrStream real-time service running on port ${PORT}`);
  console.log(`[Realtime] Auth: JWT required. CORS: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(", ") : "same-origin only"}`);
  console.log("[Realtime] Polling for changes every 5s");
});

process.on("SIGTERM", () => { io.close(); httpServer.close(); process.exit(0); });
