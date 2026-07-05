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
    let socket: Socket;
    let fallbackTimer: ReturnType<typeof setTimeout>;
    let disposed = false;

    try {
      // Build the direct-connect URL from the current page's hostname.
      // We CANNOT use "localhost" because in the user's browser that
      // resolves to their own machine — the realtime service runs on the
      // VPS, not the user's machine. Using window.location.hostname ensures
      // we point at the same host the web app is served from.
      const proto = window.location.protocol; // http: or https:
      const host = window.location.hostname;  // VPS IP or domain
      const directUrl = `${proto}//${host}:3003`;

      // Try gateway first (works when Caddy is in front)
      socket = io("/?XTransformPort=3003", {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 5,
        timeout: 5000,
      });

      // If gateway doesn't work after 3s, try direct connection to port 3003
      fallbackTimer = setTimeout(() => {
        if (disposed) return;
        if (!socket.connected) {
          console.log("[Realtime] Gateway connection failed, trying direct:", directUrl);
          socket.disconnect();
          socket = io(directUrl, {
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionAttempts: 10,
            timeout: 5000,
          });
          setupHandlers(socket);
          socketRef.current = socket;
        }
      }, 3000);

      socketRef.current = socket;
      setupHandlers(socket);

      // Clear fallback timer on successful connection
      socket.on("connect", () => {
        clearTimeout(fallbackTimer);
      });

      return () => {
        disposed = true;
        clearTimeout(fallbackTimer);
        socket.disconnect();
        socketRef.current = null;
      };
    } catch (err) {
      console.error("[Realtime] Failed to initialize:", err);
      return;
    }

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
        // Log connection errors at debug level — these are expected when
        // the realtime service is not running or the network blocks the
        // port. We don't want to spam the console.
        console.debug("[Realtime] Connect error:", err.message);
      });

      // Stream status changed
      s.on("stream:status", (data: any) => {
        console.log("[Realtime] Stream status:", data);
        queryClient.invalidateQueries({ queryKey: ["streams"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });

        if (data.status === "live") {
          toast.success(`Stream live: ${data.name}`);
        } else if (data.status === "error") {
          toast.error(`Stream error: ${data.name}`, {
            description: data.lastError || "Unknown error",
          });
        } else if (data.status === "ended") {
          toast.info(`Stream ended: ${data.name}`);
        }
      });

      // Stream error (detailed)
      s.on("stream:error", (data: any) => {
        console.log("[Realtime] Stream error:", data);
        toast.error(`Stream error: ${data.name}`, {
          description: data.error,
        });
      });

      // New activity log
      s.on("activity:new", (data: any) => {
        console.log("[Realtime] New activity:", data);
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
      });

      // Initial snapshot of live streams
      s.on("stream:snapshot", (data: any) => {
        console.log("[Realtime] Live streams snapshot:", data.liveStreams?.length || 0, "live");
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      });
    }
  }, [queryClient]);

  const subscribeToStreamLog = (streamId: string) => {
    socketRef.current?.emit("subscribe:stream-log", streamId);
  };

  const unsubscribeFromStreamLog = (streamId: string) => {
    socketRef.current?.emit("unsubscribe:stream-log", streamId);
  };

  return { connected, subscribeToStreamLog, unsubscribeFromStreamLog };
}
