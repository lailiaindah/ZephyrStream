"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// Hook for real-time updates via Socket.io
// Connects to the real-time mini-service on port 3003
export function useRealtimeUpdates() {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let socket: Socket;

    try {
      // Try gateway first (XTransformPort), fallback to direct connection
      // The gateway approach works in production with Caddy, but in dev
      // we may need to connect directly to the realtime service port.
      socket = io("/?XTransformPort=3003", {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 2000,
        reconnectionAttempts: 5,
        timeout: 5000,
      });

      // If gateway doesn't work after 3s, try direct connection
      const fallbackTimer = setTimeout(() => {
        if (!socket.connected) {
          console.log("[Realtime] Gateway connection failed, trying direct...");
          socket.disconnect();
          socket = io("http://localhost:3003", {
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionAttempts: 10,
          });
          setupHandlers(socket);
        }
      }, 3000);

      socketRef.current = socket;
      setupHandlers(socket);

      // Clear fallback timer on successful connection
      socket.on("connect", () => {
        clearTimeout(fallbackTimer);
      });

      return () => {
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

