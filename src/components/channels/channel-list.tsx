"use client";

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { ChannelForm } from "@/components/channels/channel-form";
import { TitleManager } from "@/components/channels/title-manager";
import { ThumbnailManager } from "@/components/channels/thumbnail-manager";
import {
  Youtube,
  Plus,
  Trash2,
  RefreshCw,
  Pencil,
  Video,
  Loader2,
  ArrowLeft,
  FileVideo,
  Type,
  Image as ImageIcon,
} from "lucide-react";

export function ChannelList() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [detailChannelId, setDetailChannelId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch("/api/channels");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.channels as any[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/channels/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }
    },
    onSuccess: () => {
      toast.success("Channel deleted");
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const syncMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/channels/${id}/sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Synced: ${data.channelInfo?.title || "Channel updated"}`);
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Show detail view when a channel is selected
  if (detailChannelId) {
    const channel = data?.find((c) => c.id === detailChannelId);
    if (!channel) {
      setDetailChannelId(null);
      return null;
    }
    return (
      <ChannelDetailView
        channel={channel}
        onBack={() => setDetailChannelId(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">YouTube Channels</h2>
          <p className="text-sm text-slate-400">
            Each channel uses its own Google Cloud credentials — click a channel to manage titles, thumbnails &amp; files
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
          Add Channel
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-slate-800/60 bg-slate-900/40 p-5">
              <div className="h-32 zephyr-shimmer rounded-lg" />
            </Card>
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card className="border-slate-800/60 bg-slate-900/40 p-12 text-center">
          <Youtube className="h-12 w-12 text-slate-700 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-white mb-1">No channels yet</h3>
          <p className="text-sm text-slate-400 mb-4">
            Add your first YouTube channel to start creating live broadcasts
          </p>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Channel
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((channel) => (
            <Card
              key={channel.id}
              className="border-slate-800/60 bg-slate-900/40 backdrop-blur-sm zephyr-card-hover overflow-hidden cursor-pointer"
              onClick={() => setDetailChannelId(channel.id)}
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 shrink-0">
                      <Youtube className="h-5 w-5 text-cyan-300" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{channel.name}</h3>
                      <p className="text-xs text-slate-500 truncate">
                        {channel.youtubeChannelName || "Not connected"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge type="channel" status={channel.status} />
                </div>

                {channel.description && (
                  <p className="text-xs text-slate-400 mb-3 line-clamp-2">{channel.description}</p>
                )}

                <div className="grid grid-cols-4 gap-1.5 text-center mb-4">
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <Video className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-xs font-semibold text-slate-300">{channel._count?.streams || 0}</p>
                    <p className="text-[9px] text-slate-500">Streams</p>
                  </div>
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <FileVideo className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-xs font-semibold text-slate-300">{channel._count?.files || 0}</p>
                    <p className="text-[9px] text-slate-500">Files</p>
                  </div>
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <Type className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-xs font-semibold text-slate-300">{channel._count?.titles || 0}</p>
                    <p className="text-[9px] text-slate-500">Titles</p>
                  </div>
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <ImageIcon className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-xs font-semibold text-slate-300">{channel._count?.thumbnails || 0}</p>
                    <p className="text-[9px] text-slate-500">Thumbs</p>
                  </div>
                </div>

                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncMutation.mutate(channel.id)}
                    disabled={syncMutation.isPending || channel.status !== "active"}
                    className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    {syncMutation.isPending && syncMutation.variables === channel.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Sync
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditing(channel);
                      setFormOpen(true);
                    }}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm(`Delete channel "${channel.name}"? This will also delete all its titles, thumbnails, and unassign its files. This cannot be undone.`)) {
                        deleteMutation.mutate(channel.id);
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

      <ChannelForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editingChannel={editing}
      />
    </div>
  );
}

function ChannelDetailView({
  channel,
  onBack,
}: {
  channel: any;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack} className="text-slate-300 hover:bg-slate-800">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Channels
        </Button>
      </div>

      <Card className="border-slate-800/60 bg-slate-900/40 overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 shrink-0">
                <Youtube className="h-7 w-7 text-cyan-300" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{channel.name}</h2>
                <p className="text-sm text-slate-400">
                  {channel.youtubeChannelName || "Not connected to YouTube"}
                </p>
                {channel.description && (
                  <p className="text-xs text-slate-500 mt-1">{channel.description}</p>
                )}
              </div>
            </div>
            <StatusBadge type="channel" status={channel.status} />
          </div>
        </div>
      </Card>

      {/* Title and Thumbnail managers side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <TitleManager channelId={channel.id} channelName={channel.name} />
        <ThumbnailManager channelId={channel.id} channelName={channel.name} />
      </div>

      {/* Channel-scoped file manager */}
      <ChannelFileManager channelId={channel.id} channelName={channel.name} />
    </div>
  );
}

// Inline file manager scoped to a specific channel
function ChannelFileManager({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: files, isLoading } = useQuery({
    queryKey: ["files", channelId],
    queryFn: async () => {
      const res = await fetch(`/api/files?channelId=${channelId}`);
      const data = await res.json();
      return data.files as any[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      formData.append("channelId", channelId);
      files.forEach((f) => formData.append("files", f));
      const res = await fetch("/api/files/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.files.length} file(s) uploaded to ${channelName}`);
      queryClient.invalidateQueries({ queryKey: ["files", channelId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/files?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
    },
    onSuccess: () => {
      toast.success("File deleted");
      queryClient.invalidateQueries({ queryKey: ["files", channelId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/files?all=true&channelId=${channelId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} file(s) from ${channelName}`);
      queryClient.invalidateQueries({ queryKey: ["files", channelId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    uploadMutation.mutate(fileList);
    e.target.value = "";
  };

  return (
    <Card className="border-slate-800/60 bg-slate-900/40">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <FileVideo className="h-4 w-4 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Video Files</h3>
              <p className="text-[11px] text-slate-500">
                {files?.length || 0} files for {channelName}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="bg-gradient-to-r from-amber-500 to-cyan-500 hover:from-amber-400 hover:to-cyan-400 text-slate-950"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1" />
            )}
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-6">
            <Loader2 className="h-5 w-5 text-amber-300 mx-auto animate-spin" />
          </div>
        ) : !files || files.length === 0 ? (
          <div className="text-center py-8">
            <FileVideo className="h-8 w-8 text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-500 mb-1">No video files yet</p>
            <p className="text-[10px] text-slate-600">
              Upload video files for this channel — they won't appear in other channels
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/60 hover:border-slate-700"
              >
                <FileVideo className="h-4 w-4 text-amber-300 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{file.originalName}</p>
                  <p className="text-[10px] text-slate-500">
                    {(file.size / 1024 / 1024).toFixed(1)} MB • {file.mimeType}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete "${file.originalName}"?`)) {
                      deleteMutation.mutate(file.id);
                    }
                  }}
                  className="h-7 w-7 text-slate-500 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {files && files.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800/60">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(`Delete ALL ${files.length} files for ${channelName}? This cannot be undone.`)) {
                  deleteAllMutation.mutate();
                }
              }}
              disabled={deleteAllMutation.isPending}
              className="w-full text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            >
              {deleteAllMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1" />
              )}
              Delete All Files
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
