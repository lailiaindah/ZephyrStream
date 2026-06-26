"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/status-badge";
import { ChannelForm } from "@/components/channels/channel-form";
import {
  Youtube,
  Plus,
  Trash2,
  RefreshCw,
  Pencil,
  Users,
  Eye,
  Video,
  Loader2,
} from "lucide-react";

export function ChannelList() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">YouTube Channels</h2>
          <p className="text-sm text-slate-400">
            Each channel uses its own Google Cloud credentials for creating live broadcasts
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
              className="border-slate-800/60 bg-slate-900/40 backdrop-blur-sm zephyr-card-hover overflow-hidden"
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

                <div className="grid grid-cols-3 gap-2 text-center mb-4">
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <Video className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-xs font-semibold text-slate-300">{channel._count?.streams || 0}</p>
                    <p className="text-[10px] text-slate-500">Streams</p>
                  </div>
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <Users className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-xs font-semibold text-slate-300">
                      {channel.youtubeChannelId ? "✓" : "—"}
                    </p>
                    <p className="text-[10px] text-slate-500">YT Linked</p>
                  </div>
                  <div className="rounded-md bg-slate-950/50 border border-slate-800/60 py-2">
                    <Eye className="h-3 w-3 text-slate-500 mx-auto mb-0.5" />
                    <p className="text-xs font-semibold text-slate-300">
                      {channel.lastSyncAt ? "✓" : "—"}
                    </p>
                    <p className="text-[10px] text-slate-500">Synced</p>
                  </div>
                </div>

                <div className="flex gap-2">
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
                      if (confirm(`Delete channel "${channel.name}"? This cannot be undone.`)) {
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
