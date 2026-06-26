"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Trash2,
  Loader2,
  Type,
  Image as ImageIcon,
  ListChecks,
  Upload,
  X,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TitleManagerProps {
  channelId: string;
  channelName: string;
}

export function TitleManager({ channelId, channelName }: TitleManagerProps) {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [bulkText, setBulkText] = useState("");

  const { data: titles, isLoading } = useQuery({
    queryKey: ["titles", channelId],
    queryFn: async () => {
      const res = await fetch(`/api/titles?channelId=${channelId}`);
      const data = await res.json();
      return data.titles as any[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, title: newTitle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Title added");
      queryClient.invalidateQueries({ queryKey: ["titles", channelId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setNewTitle("");
      setAddOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const titles = bulkText
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean);
      if (titles.length === 0) throw new Error("No titles to add");
      const res = await fetch("/api/titles/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, titles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.count} titles added`);
      queryClient.invalidateQueries({ queryKey: ["titles", channelId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setBulkText("");
      setBulkOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/titles/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
    },
    onSuccess: () => {
      toast.success("Title deleted");
      queryClient.invalidateQueries({ queryKey: ["titles", channelId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/titles/delete-all?channelId=${channelId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} titles`);
      queryClient.invalidateQueries({ queryKey: ["titles", channelId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch(`/api/titles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["titles", channelId] });
    },
  });

  return (
    <Card className="border-slate-800/60 bg-slate-900/40">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <Type className="h-4 w-4 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Stream Titles</h3>
              <p className="text-[11px] text-slate-500">
                {titles?.length || 0} titles for {channelName}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setBulkOpen(true)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <ListChecks className="h-3.5 w-3.5 mr-1" />
              Bulk
            </Button>
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="text-center py-6">
              <Loader2 className="h-5 w-5 text-cyan-300 mx-auto animate-spin" />
            </div>
          ) : !titles || titles.length === 0 ? (
            <div className="text-center py-8">
              <Type className="h-8 w-8 text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-500 mb-1">No titles yet</p>
              <p className="text-[10px] text-slate-600">
                Add titles to rotate through for anti-spam variation
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 pr-2">
              {titles.map((t, idx) => (
                <div
                  key={t.id}
                  className={cn(
                    "flex items-center gap-2 p-2.5 rounded-lg border transition-colors",
                    t.enabled
                      ? "bg-slate-950/40 border-slate-800/60"
                      : "bg-slate-950/20 border-slate-800/40 opacity-60"
                  )}
                >
                  <span className="text-[10px] font-mono text-slate-500 w-6 text-center">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-sm text-slate-200 truncate">
                    {t.emoji && <span className="mr-1">{t.emoji}</span>}
                    {t.title}
                  </span>
                  <Switch
                    checked={t.enabled}
                    onCheckedChange={(v) =>
                      toggleMutation.mutate({ id: t.id, enabled: v })
                    }
                    className="scale-75"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate(t.id)}
                    className="h-7 w-7 text-slate-500 hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {titles && titles.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800/60">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(`Delete all ${titles.length} titles for ${channelName}?`)) {
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
              Delete All Titles
            </Button>
          </div>
        )}
      </div>

      {/* Add single title dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-cyan-300" />
              Add Title
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Add a new stream title for {channelName}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="My Awesome Live Stream"
            autoFocus
            className="bg-slate-900 border-slate-700 text-white"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => addMutation.mutate()}
              disabled={!newTitle.trim() || addMutation.isPending}
              className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950"
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Title
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk add dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-cyan-300" />
              Bulk Add Titles
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Paste one title per line. Empty lines are ignored.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"Morning Live Stream\nAfternoon Gaming Session\nEvening Music Mix"}
            rows={8}
            autoFocus
            className="bg-slate-900 border-slate-700 text-white font-mono text-xs"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => bulkMutation.mutate()}
              disabled={!bulkText.trim() || bulkMutation.isPending}
              className="bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950"
            >
              {bulkMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Titles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
