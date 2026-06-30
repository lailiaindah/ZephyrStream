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
  DialogDescription,
  DialogFooter,
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
  Copy,
  Youtube,
  Calendar,
  Repeat,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function StreamList() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [logStreamId, setLogStreamId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [stopDialogStream, setStopDialogStream] = useState<any>(null);

  // Fetch channels for the filter
  const { data: channelsData } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch("/api/channels");
      const data = await res.json();
      return data.channels as any[];
    },
  });

  // Fetch streams (filtered by selected channel)
  const { data, isLoading } = useQuery({
    queryKey: ["streams", selectedChannelId],
    queryFn: async () => {
      const url = selectedChannelId
        ? `/api/streams?channelId=${selectedChannelId}`
        : "/api/streams";
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.streams as any[];
    },
    refetchInterval: 5000,
  });

  // Fetch stream counts per channel (for the channel selector badges)
  const { data: allStreams } = useQuery({
    queryKey: ["streams", "all-for-counts"],
    queryFn: async () => {
      const res = await fetch("/api/streams");
      const data = await res.json();
      return data.streams as any[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      // Force the channelId to the selected one if locked
      if (selectedChannelId) payload.channelId = selectedChannelId;
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

  const duplicateMutation = useMutation({
    mutationFn: async (sourceStream: any) => {
      // Send a create request with duplicateFrom — backend copies all fields
      const res = await fetch("/api/streams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateFrom: sourceStream.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Stream duplicated");
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
    mutationFn: async ({ id, skipReschedule }: { id: string; skipReschedule?: boolean }) => {
      const res = await fetch(`/api/streams/${id}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipReschedule: skipReschedule || false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, variables) => {
      toast.success(
        variables.skipReschedule
          ? "Stream stopped (no reschedule)"
          : "Stream stopped"
      );
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setStopDialogStream(null);
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

  // Count streams per channel
  const streamCounts: Record<string, number> = {};
  (allStreams || []).forEach((s) => {
    if (s.channelId) {
      streamCounts[s.channelId] = (streamCounts[s.channelId] || 0) + 1;
    }
  });
  const unassignedCount = (allStreams || []).filter((s) => !s.channelId).length;
  const totalCount = (allStreams || []).length;

  const selectedChannel = channelsData?.find((c) => c.id === selectedChannelId);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Live Streams</h2>
          <p className="text-sm text-slate-400">
            Click a channel below to filter — streams are organized per channel
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

      {/* Channel filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedChannelId(null)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
            !selectedChannelId
              ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
              : "bg-slate-900/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
          )}
        >
          <Radio className="h-3 w-3" />
          All ({totalCount})
        </button>
        <button
          onClick={() => setSelectedChannelId("unassigned")}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
            selectedChannelId === "unassigned"
              ? "bg-slate-500/30 border-slate-500 text-slate-200"
              : "bg-slate-900/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
          )}
        >
          <FileVideo className="h-3 w-3" />
          Unassigned ({unassignedCount})
        </button>
        {(channelsData || []).map((ch) => (
          <button
            key={ch.id}
            onClick={() => setSelectedChannelId(ch.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
              selectedChannelId === ch.id
                ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                : "bg-slate-900/40 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600"
            )}
          >
            <Youtube className="h-3 w-3" />
            {ch.name}
            <span className="text-[10px] opacity-70">({streamCounts[ch.id] || 0})</span>
          </button>
        ))}
      </div>

      {selectedChannel && (
        <div className="text-xs text-cyan-300 bg-cyan-500/5 border border-cyan-500/20 rounded-md px-3 py-2">
          Showing streams for <strong>{selectedChannel.name}</strong>. New streams will be assigned to this channel.
        </div>
      )}
      {selectedChannelId === "unassigned" && (
        <div className="text-xs text-slate-400 bg-slate-800/40 border border-slate-700 rounded-md px-3 py-2">
          Showing streams with no channel assigned.
        </div>
      )}

      {/* Stream list */}
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
          <h3 className="text-base font-semibold text-white mb-1">
            {selectedChannel
              ? `No streams for ${selectedChannel.name} yet`
              : selectedChannelId === "unassigned"
              ? "No unassigned streams"
              : "No streams yet"}
          </h3>
          <p className="text-sm text-slate-400 mb-4">
            {selectedChannel
              ? "Create a stream for this channel to start broadcasting"
              : "Create your first stream to start broadcasting to YouTube"}
          </p>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Stream
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
                        {stream.minHours}-{stream.maxHours}h
                      </p>
                      {stream.startAt && (
                        <p className="text-[10px] text-cyan-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5" />
                          {new Date(stream.startAt).toLocaleString()}
                        </p>
                      )}
                      {stream.autoCreateSchedule && (
                        <p className="text-[10px] text-emerald-400 mt-0.5 flex items-center gap-1">
                          <Repeat className="h-2.5 w-2.5" />
                          Auto next-day schedule
                        </p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={stream.status} pulse={stream.status === "live"} />
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-4">
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <FileVideo className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-[10px] text-slate-500 uppercase">
                      {stream.sourceType === "local" ? "path" : "files"}
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <Clock className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-xs font-semibold text-slate-300">
                      {stream.resolution ? stream.resolution.split("x")[1] + "p" : "—"}
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
                      onClick={() => setStopDialogStream(stream)}
                      disabled={stopMutation.isPending}
                      variant="destructive"
                    >
                      {stopMutation.isPending && stopMutation.variables?.id === stream.id ? (
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
                    onClick={() => duplicateMutation.mutate(stream)}
                    disabled={duplicateMutation.isPending}
                    className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                  >
                    {duplicateMutation.isPending && duplicateMutation.variables?.id === stream.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 mr-1" />
                    )}
                    Copy
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
        lockedChannelId={selectedChannelId && selectedChannelId !== "unassigned" ? selectedChannelId : undefined}
      />

      {/* Stop dialog with reschedule options */}
      <Dialog open={!!stopDialogStream} onOpenChange={(o) => !o && setStopDialogStream(null)}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Square className="h-5 w-5 text-rose-400" />
              Stop Stream
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Stop "{stopDialogStream?.name}"?
              {stopDialogStream?.autoCreateSchedule
                ? " Choose whether to create a next-day schedule."
                : ""}
            </DialogDescription>
          </DialogHeader>

          {stopDialogStream?.autoCreateSchedule ? (
            <div className="space-y-3 pt-2">
              <Button
                onClick={() => stopMutation.mutate({ id: stopDialogStream.id, skipReschedule: false })}
                disabled={stopMutation.isPending}
                className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 text-white"
              >
                {stopMutation.isPending && !stopMutation.variables?.skipReschedule ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Repeat className="h-4 w-4 mr-2" />
                )}
                Stop &amp; Reschedule (tomorrow)
              </Button>
              <Button
                onClick={() => stopMutation.mutate({ id: stopDialogStream.id, skipReschedule: true })}
                disabled={stopMutation.isPending}
                variant="outline"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                {stopMutation.isPending && stopMutation.variables?.skipReschedule ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Stop Only (No Reschedule)
              </Button>
              <p className="text-[11px] text-slate-500 text-center pt-1">
                &quot;Stop &amp; Reschedule&quot; creates a new stream for tomorrow at the same time.
                &quot;Stop Only&quot; just stops this stream.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              <Button
                onClick={() => stopMutation.mutate({ id: stopDialogStream.id, skipReschedule: false })}
                disabled={stopMutation.isPending}
                className="w-full bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 text-white"
              >
                {stopMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Stop Stream
              </Button>
              <p className="text-[11px] text-slate-500 text-center">
                Auto-create schedule is off — no next-day schedule will be created.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setStopDialogStream(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
