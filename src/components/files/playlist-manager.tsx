"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ListVideo,
  Plus,
  Trash2,
  Loader2,
  Music2,
  X,
  ArrowUp,
  ArrowDown,
  Save,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PlaylistManagerProps {
  channelId: string; // "all" | "unassigned" | channel id
}

export function PlaylistManager({ channelId }: PlaylistManagerProps) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<any | null>(null);

  const { data: channelsData } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch("/api/channels");
      const data = await res.json();
      return data.channels as any[];
    },
  });

  // Fetch playlists for the active channel filter
  const { data, isLoading } = useQuery({
    queryKey: ["playlists", channelId],
    queryFn: async () => {
      const url =
        channelId === "all" ? "/api/playlists" : `/api/playlists?channelId=${channelId}`;
      const res = await fetch(url);
      const data = await res.json();
      return data.playlists as any[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
      const text = await res.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("Playlist deleted");
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const selectedChannel = channelsData?.find((c) => c.id === channelId);
  const channelName =
    channelId === "all"
      ? "All Channels"
      : channelId === "unassigned"
      ? "Unassigned"
      : selectedChannel?.name || "Unknown";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <ListVideo className="h-4 w-4 text-emerald-300" />
            Playlists
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Group uploaded videos into playlists — pick them when creating a stream
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setCreateOpen(true)}
          disabled={channelId === "all" || channelId === "unassigned"}
          className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 hover:from-emerald-400 hover:to-cyan-400"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          New Playlist
        </Button>
      </div>

      {channelId === "all" || channelId === "unassigned" ? (
        <Card className="border-slate-800/60 bg-slate-900/40 p-6 text-center">
          <ListVideo className="h-8 w-8 text-slate-700 mx-auto mb-2" />
          <p className="text-xs text-slate-400">
            Select a specific channel to manage its playlists
          </p>
        </Card>
      ) : isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-slate-800/60 bg-slate-900/40 p-4">
              <div className="h-20 zephyr-shimmer rounded-lg" />
            </Card>
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card className="border-slate-800/60 bg-slate-900/40 p-8 text-center">
          <Music2 className="h-8 w-8 text-slate-700 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No playlists for {channelName} yet</p>
          <p className="text-[10px] text-slate-500 mt-1">
            Click “New Playlist” above to group uploaded videos
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Card
              key={p.id}
              className="border-slate-800/60 bg-slate-900/40 zephyr-card-hover p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
                  <ListVideo className="h-5 w-5 text-emerald-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.itemCount || p.items?.length || 0} video(s) •{" "}
                    {p.totalSize
                      ? `${(p.totalSize / 1024 / 1024).toFixed(1)} MB`
                      : "—"}
                  </p>
                  {p.shuffleOwn !== null && p.shuffleOwn !== undefined && (
                    <p className="text-[10px] text-cyan-400 mt-0.5">
                      Shuffle: {p.shuffleOwn ? "ON" : "OFF"}
                    </p>
                  )}
                  {p.channel && (
                    <p className="text-[10px] text-cyan-400 mt-0.5">
                      📺 {p.channel.name}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-1 mt-3 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingPlaylist(p)}
                  className="h-7 px-2 text-slate-400 hover:text-cyan-300"
                >
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete playlist "${p.name}"? Videos stay safe.`)) {
                      deleteMutation.mutate(p.id);
                    }
                  }}
                  disabled={deleteMutation.isPending}
                  className="h-7 px-2 text-slate-500 hover:text-rose-300"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Playlist Dialog */}
      <CreatePlaylistDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        channelId={channelId}
      />

      {/* Edit Playlist Dialog */}
      {editingPlaylist && (
        <EditPlaylistDialog
          open={!!editingPlaylist}
          onOpenChange={(o) => !o && setEditingPlaylist(null)}
          playlist={editingPlaylist}
        />
      )}
    </div>
  );
}

// ============================================================
// Create Playlist Dialog
// ============================================================
function CreatePlaylistDialog({
  open,
  onOpenChange,
  channelId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  channelId: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shuffleOwn, setShuffleOwn] = useState<boolean | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);

  // Reset form when dialog closes
  const handleClose = () => {
    setName("");
    setDescription("");
    setShuffleOwn(null);
    setSelectedFileIds([]);
    onOpenChange(false);
  };

  // Fetch this channel's files (for picker)
  const { data: filesData } = useQuery({
    queryKey: ["files", channelId],
    queryFn: async () => {
      const res = await fetch(`/api/files?channelId=${channelId}`);
      const data = await res.json();
      return data.files as any[];
    },
    enabled: open && !!channelId && channelId !== "all" && channelId !== "unassigned",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          channelId,
          fileIds: selectedFileIds,
          shuffleOwn,
        }),
      });
      const text = await res.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success(`Playlist "${name}" created`);
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      handleClose();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleFile = (id: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  // Move a selected file up/down to reorder
  const moveFile = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= selectedFileIds.length) return;
    const next = [...selectedFileIds];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setSelectedFileIds(next);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListVideo className="h-5 w-5 text-emerald-300" />
            Create New Playlist
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Group uploaded videos into a named, ordered playlist. Playlists can be
            picked when creating a stream.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-slate-200">Playlist Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning Loop, Ad Breaks, Promo Pack..."
              className="bg-slate-900 border-slate-700 text-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-200">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes about this playlist"
              className="bg-slate-900 border-slate-700 text-white"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-900/60 border border-slate-800 p-3">
            <div>
              <Label className="text-slate-200 cursor-pointer">
                Override Shuffle Setting
              </Label>
              <p className="text-[11px] text-slate-500">
                If set, this playlist will follow its own shuffle setting when
                used in a stream. Leave unset to inherit the stream&apos;s setting.
              </p>
            </div>
            <Select
              value={shuffleOwn === null ? "inherit" : shuffleOwn ? "on" : "off"}
              onValueChange={(v) =>
                setShuffleOwn(v === "inherit" ? null : v === "on")
              }
            >
              <SelectTrigger className="w-28 bg-slate-900 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="inherit">Inherit</SelectItem>
                <SelectItem value="on">Shuffle ON</SelectItem>
                <SelectItem value="off">Shuffle OFF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* File picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-slate-200">
                Pick Videos for this Playlist
              </Label>
              {selectedFileIds.length > 0 && (
                <span className="text-[10px] text-cyan-300">
                  {selectedFileIds.length} selected — order shown below
                </span>
              )}
            </div>

            {/* Selected files in order */}
            {selectedFileIds.length > 0 && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 space-y-1">
                {selectedFileIds.map((fid, idx) => {
                  const f = filesData?.find((x) => x.id === fid);
                  return (
                    <div
                      key={fid}
                      className="flex items-center gap-2 p-1.5 rounded bg-slate-900/60"
                    >
                      <span className="text-[10px] text-slate-500 w-5 text-center">
                        {idx + 1}
                      </span>
                      <Music2 className="h-3 w-3 text-emerald-300 shrink-0" />
                      <span className="text-xs text-slate-200 truncate flex-1">
                        {f?.originalName || fid}
                      </span>
                      <button
                        type="button"
                        onClick={() => moveFile(idx, -1)}
                        disabled={idx === 0}
                        className="text-slate-500 hover:text-cyan-300 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveFile(idx, 1)}
                        disabled={idx === selectedFileIds.length - 1}
                        className="text-slate-500 hover:text-cyan-300 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFile(fid)}
                        className="text-slate-500 hover:text-rose-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Available files (not yet selected) */}
            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50">
              {!filesData || filesData.length === 0 ? (
                <div className="p-6 text-center">
                  <Music2 className="h-6 w-6 text-slate-700 mx-auto mb-1" />
                  <p className="text-[11px] text-slate-500">
                    No files uploaded to this channel yet
                  </p>
                </div>
              ) : (
                filesData
                  .filter((f) => !selectedFileIds.includes(f.id))
                  .map((file) => (
                    <button
                      type="button"
                      key={file.id}
                      onClick={() => toggleFile(file.id)}
                      className="w-full flex items-center gap-2 p-2.5 hover:bg-slate-800/40 border-b border-slate-800 last:border-0 text-left"
                    >
                      <Plus className="h-3 w-3 text-emerald-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-200 truncate">
                          {file.originalName}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {file.size != null
                            ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                            : "—"}
                        </p>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 hover:from-emerald-400 hover:to-cyan-400"
          >
            {createMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Create Playlist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Edit Playlist Dialog
// ============================================================
function EditPlaylistDialog({
  open,
  onOpenChange,
  playlist,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  playlist: any;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(playlist.name);
  const [description, setDescription] = useState(playlist.description || "");
  const [shuffleOwn, setShuffleOwn] = useState<boolean | null>(
    playlist.shuffleOwn === null || playlist.shuffleOwn === undefined
      ? null
      : playlist.shuffleOwn
  );
  // selectedFileIds represents the desired final order.
  // Initialize from the playlist passed in (which may or may not have
  // items — the list endpoint includes them, but to be safe we also
  // fetch the full playlist below).
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(
    (playlist.items || []).map((it: any) => it.fileId)
  );

  // Fetch the FULL playlist (with items) when the dialog opens — the
  // playlist prop comes from the list endpoint which usually includes
  // items, but if it doesn't we'd open the dialog with an empty file
  // list and the user could accidentally save with zero files (wiping
  // the playlist). This fetch guarantees we have the actual items.
  const { data: fullPlaylist, isLoading: isLoadingFull } = useQuery({
    queryKey: ["playlist", playlist.id],
    queryFn: async () => {
      const res = await fetch(`/api/playlists/${playlist.id}`);
      const data = await res.json();
      return data.playlist as any;
    },
    enabled: open,
  });

  // When the full playlist arrives, sync selectedFileIds if it's currently
  // empty (i.e. the prop didn't include items). We only do this once per
  // open — if the user has already added/removed items, we don't override.
  useEffect(() => {
    if (fullPlaylist?.items && selectedFileIds.length === 0) {
      setSelectedFileIds(fullPlaylist.items.map((it: any) => it.fileId));
    }
  }, [fullPlaylist, selectedFileIds.length]);

  // Fetch the channel's files (for picker — supports adding new files)
  const { data: filesData } = useQuery({
    queryKey: ["files", playlist.channelId || "unassigned"],
    queryFn: async () => {
      const url = playlist.channelId
        ? `/api/files?channelId=${playlist.channelId}`
        : "/api/files?channelId=unassigned";
      const res = await fetch(url);
      const data = await res.json();
      return data.files as any[];
    },
    enabled: open,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          shuffleOwn,
          fileIds: selectedFileIds,
        }),
      });
      const text = await res.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("Playlist updated");
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleFile = (id: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const moveFile = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= selectedFileIds.length) return;
    const next = [...selectedFileIds];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setSelectedFileIds(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-cyan-300" />
            Edit Playlist
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Update name, shuffle setting, or reorder/add/remove videos
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-slate-200">Playlist Name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-slate-900 border-slate-700 text-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-slate-200">Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-slate-900 border-slate-700 text-white"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-900/60 border border-slate-800 p-3">
            <div>
              <Label className="text-slate-200 cursor-pointer">
                Override Shuffle Setting
              </Label>
              <p className="text-[11px] text-slate-500">
                Override the stream&apos;s shuffle setting when this playlist is used.
              </p>
            </div>
            <Select
              value={shuffleOwn === null ? "inherit" : shuffleOwn ? "on" : "off"}
              onValueChange={(v) =>
                setShuffleOwn(v === "inherit" ? null : v === "on")
              }
            >
              <SelectTrigger className="w-28 bg-slate-900 border-slate-700 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="inherit">Inherit</SelectItem>
                <SelectItem value="on">Shuffle ON</SelectItem>
                <SelectItem value="off">Shuffle OFF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selected files in order */}
          <div className="space-y-2">
            <Label className="text-slate-200">
              Videos in this playlist ({selectedFileIds.length})
            </Label>
            {selectedFileIds.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-center text-[11px] text-slate-500">
                No videos yet — pick from the list below
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 space-y-1">
                {selectedFileIds.map((fid, idx) => {
                  const f = filesData?.find((x) => x.id === fid);
                  return (
                    <div
                      key={fid}
                      className="flex items-center gap-2 p-1.5 rounded bg-slate-900/60"
                    >
                      <span className="text-[10px] text-slate-500 w-5 text-center">
                        {idx + 1}
                      </span>
                      <Music2 className="h-3 w-3 text-emerald-300 shrink-0" />
                      <span className="text-xs text-slate-200 truncate flex-1">
                        {f?.originalName || fid}
                      </span>
                      <button
                        type="button"
                        onClick={() => moveFile(idx, -1)}
                        disabled={idx === 0}
                        className="text-slate-500 hover:text-cyan-300 disabled:opacity-30"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveFile(idx, 1)}
                        disabled={idx === selectedFileIds.length - 1}
                        className="text-slate-500 hover:text-cyan-300 disabled:opacity-30"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFile(fid)}
                        className="text-slate-500 hover:text-rose-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Available files (not yet in playlist) */}
            <Label className="text-slate-400 text-xs mt-2">Available videos</Label>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50">
              {!filesData || filesData.length === 0 ? (
                <div className="p-6 text-center text-[11px] text-slate-500">
                  No uploaded files available
                </div>
              ) : (
                filesData
                  .filter((f) => !selectedFileIds.includes(f.id))
                  .map((file) => (
                    <button
                      type="button"
                      key={file.id}
                      onClick={() => toggleFile(file.id)}
                      className="w-full flex items-center gap-2 p-2.5 hover:bg-slate-800/40 border-b border-slate-800 last:border-0 text-left"
                    >
                      <Plus className="h-3 w-3 text-emerald-300 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-200 truncate">
                          {file.originalName}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {file.size != null
                            ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                            : "—"}
                        </p>
                      </div>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || updateMutation.isPending}
            onClick={() => updateMutation.mutate()}
            className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 hover:from-cyan-400 hover:to-emerald-400"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
