"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { StreamForm } from "@/components/streams/stream-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Radio,
  Plus,
  Trash2,
  Play,
  Square,
  Pencil,
  Loader2,
  FileVideo,
  Clock,
  ScrollText,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export function StreamList() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [logStreamId, setLogStreamId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["streams"],
    queryFn: async () => {
      const res = await fetch("/api/streams");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.streams as any[];
    },
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Stream created");
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setFormOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await fetch(`/api/streams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Stream updated");
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      setFormOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/streams/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      toast.success("Stream deleted");
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const startMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/streams/${id}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Stream started — FFmpeg is now pushing to YouTube");
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const stopMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/streams/${id}/stop`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Stream stopped");
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (payload: any) => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Live Streams</h2>
          <p className="text-sm text-slate-400">
            Stream video files to YouTube using stream keys (saves API quota)
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Stream
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-slate-800/60 bg-slate-900/40 p-5">
              <div className="h-32 zephyr-shimmer rounded-lg" />
            </Card>
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card className="border-slate-800/60 bg-slate-900/40 p-12 text-center">
          <Radio className="h-12 w-12 text-slate-700 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white mb-1">No streams yet</h3>
          <p className="text-sm text-slate-400 mb-4">
            Create your first stream to start broadcasting to YouTube
          </p>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Your First Stream
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((stream) => (
            <Card
              key={stream.id}
              className="border-slate-800/60 bg-slate-900/40 backdrop-blur-sm zephyr-card-hover overflow-hidden"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${
                      stream.status === "live"
                        ? "bg-red-500/20 border border-red-500/40 zephyr-glow-rose"
                        : "bg-cyan-500/10 border border-cyan-500/30"
                    }`}>
                      <Radio className={`h-5 w-5 ${stream.status === "live" ? "text-red-300" : "text-cyan-300"}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{stream.name}</h3>
                      <p className="text-xs text-slate-500 truncate">
                        {stream.channel?.name || "No channel"} •{" "}
                        {stream.durationMinutes}m
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={stream.status} pulse={stream.status === "live"} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-4">
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <FileVideo className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-[10px] text-slate-500 uppercase">
                      {stream.sourceType}
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <Clock className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-xs font-semibold text-slate-300">
                      {stream.resolution.split("x")[1]}p
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <Radio className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-xs font-semibold text-slate-300">
                      {stream.fps}fps
                    </p>
                  </div>
                </div>

                {stream.lastError && (
                  <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2">
                    <p className="text-[11px] text-rose-300 truncate">{stream.lastError}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {stream.status !== "live" && stream.status !== "preparing" ? (
                    <Button
                      size="sm"
                      onClick={() => startMutation.mutate(stream.id)}
                      disabled={startMutation.isPending}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                    >
                      {startMutation.isPending && startMutation.variables === stream.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5 mr-1" />
                      )}
                      Start
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => stopMutation.mutate(stream.id)}
                      disabled={stopMutation.isPending}
                      variant="destructive"
                    >
                      {stopMutation.isPending && stopMutation.variables === stream.id ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Square className="h-3.5 w-3.5 mr-1" />
                      )}
                      Stop
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(stream);
                      setFormOpen(true);
                    }}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLogStreamId(stream.id)}
                    disabled={!stream.logFile}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <ScrollText className="h-3.5 w-3.5 mr-1" />
                    Log
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm(`Delete stream "${stream.name}"?`)) {
                        deleteMutation.mutate(stream.id);
                      }
                    }}
                    className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <StreamForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editingStream={editing}
        onSubmit={handleSubmit}
        isLoading={createMutation.isPending || updateMutation.isPending}
      />

      <LogViewerDialog streamId={logStreamId} onClose={() => setLogStreamId(null)} />
    </div>
  );
}

function LogViewerDialog({ streamId, onClose }: { streamId: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["stream-log", streamId],
    queryFn: async () => {
      const res = await fetch(`/api/streams/${streamId}/log?lines=200`);
      const data = await res.json();
      return data;
    },
    enabled: !!streamId,
    refetchInterval: 2000,
  });

  return (
    <Dialog open={!!streamId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-cyan-300" />
            Stream Log
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] rounded-lg border border-slate-800 bg-slate-950">
          <pre className="text-xs text-slate-300 p-4 font-mono whitespace-pre-wrap">
            {isLoading ? "Loading..." : data?.log || "No log available"}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
