// ZephyrStream Real-Time Service (Socket.io)
// Port 3003 — polls database for stream status + activity log changes
// Start: cd mini-services/realtime && bun install && bun run dev
//
// Uses the PARENT PROJECT's Prisma Client (not its own).
// The parent project's generated client is at ../../node_modules/@prisma/client
// This avoids the "did not initialize yet" error because prisma generate
// only runs in the parent project directory.

import { Server as SocketIOServer } from "socket.io";
import http from "http";
import path from "path";

// Dynamically import PrismaClient from the parent project's node_modules
// This ensures we use the already-generated client
// eslint-disable-next-line @typescript-eslint/no-require-imports
const parentNodeModules = path.resolve(__dirname, "../../node_modules/@prisma/client");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require(parentNodeModules);

const PORT = 3003;
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
  cors: { origin: "*", methods: ["GET", "POST"] },
});

let connectedClients = 0;

io.on("connection", (socket) => {
  connectedClients++;
  console.log(`[Realtime] Client connected (total: ${connectedClients})`);
  sendLiveStreamsSnapshot(socket);

  socket.on("disconnect", () => {
    connectedClients--;
    console.log(`[Realtime] Client disconnected (total: ${connectedClients})`);
  });

  socket.on("subscribe:stream-log", (streamId: string) => {
    socket.join(`stream-log:${streamId}`);
  });
  socket.on("unsubscribe:stream-log", (streamId: string) => {
    socket.leave(`stream-log:${streamId}`);
  });
});

let lastStreamCheck = new Date();

async function checkStreamChanges() {
  try {
    const changed = await db.stream.findMany({
      where: { updatedAt: { gt: lastStreamCheck } },
      select: { id: true, name: true, status: true, lastError: true, startedAt: true, endedAt: true, pid: true, userId: true },
      take: 50,
    });
    for (const stream of changed) {
      io.emit("stream:status", {
        id: stream.id, name: stream.name, status: stream.status,
        lastError: stream.lastError, userId: stream.userId,
        startedAt: stream.startedAt?.toISOString(), endedAt: stream.endedAt?.toISOString(),
      });
      if (stream.status === "error" && stream.lastError) {
        io.emit("stream:error", { id: stream.id, name: stream.name, error: stream.lastError, userId: stream.userId });
      }
    }
    lastStreamCheck = new Date();
  } catch (err: any) { console.error("[Realtime] Stream check error:", err.message); }
}

let lastActivityCheck = new Date();

async function checkNewActivity() {
  try {
    const newLogs = await db.activityLog.findMany({
      where: { createdAt: { gt: lastActivityCheck } },
      select: { id: true, level: true, category: true, message: true, details: true, userId: true, createdAt: true },
      take: 20, orderBy: { createdAt: "asc" },
    });
    for (const log of newLogs) {
      io.emit("activity:new", {
        id: log.id, level: log.level, category: log.category, message: log.message,
        details: log.details, userId: log.userId, createdAt: log.createdAt.toISOString(),
      });
    }
    lastActivityCheck = new Date();
  } catch (err: any) { console.error("[Realtime] Activity check error:", err.message); }
}

async function sendLiveStreamsSnapshot(socket: any) {
  try {
    const live = await db.stream.findMany({
      where: { status: "live" },
      select: { id: true, name: true, status: true, startedAt: true, pid: true, userId: true },
    });
    socket.emit("stream:snapshot", {
      liveStreams: live.map((s) => ({ ...s, startedAt: s.startedAt?.toISOString() })),
    });
  } catch (err: any) { console.error("[Realtime] Snapshot error:", err.message); }
}

httpServer.on("request", (req, res) => {
  if (req.method === "POST" && req.url === "/emit") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const { event, data, room } = JSON.parse(body);
        if (room) io.to(room).emit(event, data); else io.emit(event, data);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err: any) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
});

setInterval(checkStreamChanges, 5000);
setInterval(checkNewActivity, 5000);

httpServer.listen(PORT, () => {
  console.log(`[Realtime] ZephyrStream real-time service running on port ${PORT}`);
  console.log("[Realtime] Polling for changes every 5s");
});

process.on("SIGTERM", () => { io.close(); httpServer.close(); process.exit(0); });
