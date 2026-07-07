"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Hook for real-time updates via Socket.io
//
// Connection strategy (in order):
//   1. Try the same-origin gateway path "/?XTransformPort=3003" — this works
//      when a reverse proxy (e.g. Caddy) is in front and rewrites the request
//      to port 3003. It is the cleanest approach because no CORS / mixed-
//      content issues arise.
//
//   2. If the gateway doesn't connect within 3s, fall back to a DIRECT
//      connection to the realtime service. The URL is built from
//      window.location.hostname (NOT "localhost" — that would resolve to the
//      user's own machine, not the VPS) on port 3003. The protocol inherits
//      from the page (https → wss, http → ws) so we don't trip mixed-content
//      blockers.
//
//   3. If both fail, the UI shows "Realtime Offline" but the rest of the app
//      continues to work via normal HTTP polling (TanStack Query refetches).
export function useRealtimeUpdates() {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: Socket | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout>;
    let disposed = false;

    // Use an async IIFE because useEffect can't be async, but we need
    // to await the token fetch before connecting.
    (async () => {
      if (disposed) return;

      try {
        const proto = window.location.protocol;
        const host = window.location.hostname;
        const directUrl = `${proto}//${host}:3003`;

        // Fetch a JWT token for realtime service auth. The session cookie
        // is HttpOnly so JS can't read it — this endpoint returns the
        // token value so we can pass it via socket.io's auth handshake.
        let realtimeToken: string | undefined;
        try {
          const tokenRes = await fetch("/api/auth/realtime-token", { method: "POST" });
          if (tokenRes.ok) {
            const tokenData = await tokenRes.json();
            realtimeToken = tokenData.token;
          }
        } catch {
          // Token fetch failed — realtime will just stay offline
        }

        if (disposed) return;

        const socketOptions = {
          transports: ["websocket", "polling"],
          reconnection: true,
          reconnectionDelay: 2000,
          reconnectionAttempts: 5,
          timeout: 5000,
          auth: realtimeToken ? { token: realtimeToken } : undefined,
        };

        // Try gateway first (works when Caddy is in front)
        socket = io("/?XTransformPort=3003", socketOptions);

        // If gateway doesn't work after 3s, try direct connection to port 3003
        fallbackTimer = setTimeout(() => {
          if (disposed || !socket) return;
          if (!socket.connected) {
            console.log("[Realtime] Gateway connection failed, trying direct:", directUrl);
            socket.removeAllListeners();
            socket.disconnect();
            socket = io(directUrl, {
              ...socketOptions,
              reconnectionAttempts: 10,
            });
            setupHandlers(socket);
            socketRef.current = socket;
          }
        }, 3000);

        socketRef.current = socket;
        setupHandlers(socket);

        socket.on("connect", () => {
          clearTimeout(fallbackTimer);
        });
      } catch (err) {
        console.error("[Realtime] Failed to initialize:", err);
      }
    })();

    function setupHandlers(s: Socket) {
      s.on("connect", () => {
        setConnected(true);
        console.log("[Realtime] Connected");
      });

      s.on("disconnect", () => {
        setConnected(false);
        console.log("[Realtime] Disconnected");
      });

      s.on("connect_error", (err: any) => {
        console.debug("[Realtime] Connect error:", err.message);
      });

      s.on("stream:status", (data: any) => {
        queryClient.invalidateQueries({ queryKey: ["streams"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        if (data.status === "live") {
          toast.success(`Stream live: ${data.name}`);
        } else if (data.status === "error") {
          toast.error(`Stream error: ${data.name}`, { description: data.lastError || "Unknown error" });
        } else if (data.status === "ended") {
          toast.info(`Stream ended: ${data.name}`);
        }
      });

      s.on("stream:error", (data: any) => {
        toast.error(`Stream error: ${data.name}`, { description: data.error });
      });

      s.on("activity:new", () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
      });

      s.on("stream:snapshot", () => {
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      });
    }

    return () => {
      disposed = true;
      clearTimeout(fallbackTimer);
      if (socket) {
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [queryClient]);

  const subscribeToStreamLog = (streamId: string) => {
    socketRef.current?.emit("subscribe:stream-log", streamId);
  };

  const unsubscribeFromStreamLog = (streamId: string) => {
    socketRef.current?.emit("unsubscribe:stream-log", streamId);
  };

  return { connected, subscribeToStreamLog, unsubscribeFromStreamLog };
}
