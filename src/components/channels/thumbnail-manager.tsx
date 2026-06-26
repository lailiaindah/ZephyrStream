"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Trash2,
  Loader2,
  Image as ImageIcon,
  Upload,
  Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ThumbnailManagerProps {
  channelId: string;
  channelName: string;
}

export function ThumbnailManager({ channelId, channelName }: ThumbnailManagerProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: thumbnails, isLoading } = useQuery({
    queryKey: ["thumbnails", channelId],
    queryFn: async () => {
      const res = await fetch(`/api/thumbnails?channelId=${channelId}`);
      const data = await res.json();
      return data.thumbnails as any[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      formData.append("channelId", channelId);
      files.forEach((f) => formData.append("files", f));
      const res = await fetch("/api/thumbnails", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.thumbnails.length} thumbnail(s) uploaded`);
      queryClient.invalidateQueries({ queryKey: ["thumbnails", channelId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/thumbnails/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
    },
    onSuccess: () => {
      toast.success("Thumbnail deleted");
      queryClient.invalidateQueries({ queryKey: ["thumbnails", channelId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/thumbnails/delete-all?channelId=${channelId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} thumbnails`);
      queryClient.invalidateQueries({ queryKey: ["thumbnails", channelId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const shuffleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/thumbnails/shuffle?channelId=${channelId}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Shuffled ${data.count} thumbnails`);
      queryClient.invalidateQueries({ queryKey: ["thumbnails", channelId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    uploadMutation.mutate(files);
    e.target.value = "";
  };

  return (
    <Card className="border-slate-800/60 bg-slate-900/40">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <ImageIcon className="h-4 w-4 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Thumbnails</h3>
              <p className="text-[11px] text-slate-500">
                {thumbnails?.length || 0} images for {channelName}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => shuffleMutation.mutate()}
              disabled={shuffleMutation.isPending || !thumbnails?.length}
              className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
              title="Shuffle thumbnail order"
            >
              {shuffleMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Shuffle className="h-3.5 w-3.5 mr-1" />
              )}
              Shuffle
            </Button>
            <Button
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              Upload
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="text-center py-6">
              <Loader2 className="h-5 w-5 text-emerald-300 mx-auto animate-spin" />
            </div>
          ) : !thumbnails || thumbnails.length === 0 ? (
            <div className="text-center py-8">
              <ImageIcon className="h-8 w-8 text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-500 mb-1">No thumbnails yet</p>
              <p className="text-[10px] text-slate-600">
                Upload images (JPG, PNG, WebP) — YouTube recommends 1280×720
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pr-2">
              {thumbnails.map((thumb) => (
                <div
                  key={thumb.id}
                  className="relative group rounded-lg overflow-hidden border border-slate-800/60 bg-slate-950/60"
                >
                  <div className="aspect-video bg-slate-900">
                    <img
                      src={`/api/thumbnails/${thumb.id}`}
                      alt={thumb.originalName}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-2">
                    <p className="text-[10px] text-slate-300 truncate">
                      {thumb.originalName}
                    </p>
                    <p className="text-[9px] text-slate-500">
                      {(thumb.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm("Delete this thumbnail?")) {
                        deleteMutation.mutate(thumb.id);
                      }
                    }}
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-md bg-slate-950/80 border border-rose-500/40 text-rose-400 hover:bg-rose-500/20 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3 mx-auto" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {thumbnails && thumbnails.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800/60">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(`Delete all ${thumbnails.length} thumbnails for ${channelName}?`)) {
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
              Delete All Thumbnails
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
