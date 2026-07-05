"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  UploadCloud,
  HardDrive,
  FileVideo,
  Trash2,
  Loader2,
  Cloud,
  FolderOpen,
  Download,
  Filter,
  ListVideo,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PlaylistManager } from "./playlist-manager";

export function FileManager() {
  const queryClient = useQueryClient();
  const [gdriveOpen, setGdriveOpen] = useState(false);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("files");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch channels for the filter dropdown
  const { data: channelsData } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch("/api/channels");
      const data = await res.json();
      return data.channels as any[];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["files", channelFilter],
    queryFn: async () => {
      const url = channelFilter === "all"
        ? "/api/files"
        : `/api/files?channelId=${channelFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      return data.files as any[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      // Send channelId via query string — the upload route uses formidable
      // for streaming multipart parsing (bypassing Next.js 16's built-in
      // body parser that fails for large files with "Server acted in an
      // unexpected way"). formidable still receives file fields below.
      const channelIdForUpload = channelFilter === "all" ? "unassigned" : channelFilter;
      files.forEach((f) => formData.append("files", f));
      const res = await fetch(`/api/files/upload?channelId=${encodeURIComponent(channelIdForUpload)}`, {
        method: "POST",
        body: formData,
      });
      // The server may return a non-JSON body if something goes wrong at
      // the transport layer; guard against that so we never throw a
      // confusing "Unexpected token 'S'..." JSON parse error to the user.
      const text = await res.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(
          `Upload failed (HTTP ${res.status}). The server response was not valid JSON. ` +
          `This usually means the file was too large or the connection was interrupted. ` +
          `Try a smaller file or check your network.`
        );
      }
      if (!res.ok) throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`${data.files.length} file(s) uploaded`);
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
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
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({ all: "true" });
      if (channelFilter !== "all") params.set("channelId", channelFilter);
      const res = await fetch(`/api/files?${params}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} file(s)`);
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    uploadMutation.mutate(files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    uploadMutation.mutate(files);
  };

  const selectedChannel = channelsData?.find((c) => c.id === channelFilter);
  const channelName = channelFilter === "all"
    ? "All Channels"
    : channelFilter === "unassigned"
    ? "Unassigned"
    : selectedChannel?.name || "Unknown";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-white">File Manager</h2>
          <p className="text-sm text-slate-400">
            Upload video files — automatically scoped to the selected channel
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setGdriveOpen(true)}
            variant="outline"
            disabled={channelFilter === "all" || channelFilter === "unassigned"}
            className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
          >
            <Cloud className="h-4 w-4 mr-2" />
            Google Drive
          </Button>
        </div>
      </div>

      {/* Channel filter */}
      <Card className="border-slate-800/60 bg-slate-900/40 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Filter className="h-4 w-4 text-cyan-300" />
            <span>Filter by channel:</span>
          </div>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-64 bg-slate-900 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              <SelectItem value="all">📁 All Channels (all files)</SelectItem>
              <SelectItem value="unassigned">❓ Unassigned files</SelectItem>
              {channelsData?.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>
                  {ch.status === "active" ? "✓" : "○"} {ch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="text-xs text-slate-500 ml-auto">
            {data?.length || 0} file(s) shown
          </div>
        </div>
        {channelFilter !== "all" && channelFilter !== "unassigned" && (
          <div className="mt-3 p-2.5 rounded-md bg-cyan-500/5 border border-cyan-500/20 text-xs text-cyan-300">
            <strong>Note:</strong> New uploads &amp; Google Drive imports will be assigned to <strong>{channelName}</strong>.
            Files for other channels won't appear here.
          </div>
        )}
        {channelFilter === "all" && (
          <div className="mt-3 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
            <strong>Tip:</strong> Select a specific channel to scope uploads. With "All Channels" selected, new uploads will be <strong>unassigned</strong>.
          </div>
        )}
      </Card>

      {/* Tabs: Files | Playlists */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-slate-900 border border-slate-800">
          <TabsTrigger
            value="files"
            className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300"
          >
            <FileVideo className="h-3.5 w-3.5 mr-1.5" /> Files
          </TabsTrigger>
          <TabsTrigger
            value="playlists"
            className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300"
          >
            <ListVideo className="h-3.5 w-3.5 mr-1.5" /> Playlists
          </TabsTrigger>
        </TabsList>

        <TabsContent value="files" className="space-y-4 mt-4">
          {/* Upload zone */}
          <Card
            className="border-2 border-dashed border-slate-700 hover:border-cyan-500/50 bg-slate-900/40 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="p-10 text-center">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-10 w-10 text-cyan-300 mx-auto mb-3 animate-spin" />
                  <p className="text-sm text-slate-300">
                    Uploading to {channelName}...
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 mx-auto mb-3">
                    <UploadCloud className="h-7 w-7 text-cyan-300" />
                  </div>
                  <p className="text-sm font-medium text-white mb-1">
                    Drop files here or click to upload
                  </p>
                  <p className="text-xs text-slate-500">
                    {channelFilter === "all"
                      ? "Files will be uploaded as unassigned — select a channel to scope them"
                      : `Files will be assigned to: ${channelName}`}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-1">
                    Supports multiple files: MP4, MOV, MKV, AVI, WebM, TS, FLV
                  </p>
                </>
              )}
            </div>
          </Card>

          {/* File list with delete-all */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              {channelName} — {data?.length || 0} file(s)
            </h3>
            {data && data.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm(`Delete ALL ${data.length} files for ${channelName}? This cannot be undone.`)) {
                    deleteAllMutation.mutate();
                  }
                }}
                disabled={deleteAllMutation.isPending}
                className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
              >
                {deleteAllMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                )}
                Delete All Files
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="border-slate-800/60 bg-slate-900/40 p-4">
                  <div className="h-16 zephyr-shimmer rounded-lg" />
                </Card>
              ))}
            </div>
          ) : !data || data.length === 0 ? (
            <Card className="border-slate-800/60 bg-slate-900/40 p-10 text-center">
              <FileVideo className="h-10 w-10 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No files in this view</p>
              <p className="text-xs text-slate-500 mt-1">
                Upload files above or switch the channel filter
              </p>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((file) => (
                <Card
                  key={file.id}
                  className="border-slate-800/60 bg-slate-900/40 zephyr-card-hover overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "flex items-center justify-center h-10 w-10 rounded-lg shrink-0",
                        file.storageType === "gdrive"
                          ? "bg-amber-500/10 border border-amber-500/30"
                          : "bg-emerald-500/10 border border-emerald-500/30"
                      )}>
                        {file.storageType === "gdrive" ? (
                          <Cloud className="h-5 w-5 text-amber-300" />
                        ) : (
                          <HardDrive className="h-5 w-5 text-emerald-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {file.originalName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {file.size != null ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "—"}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          {new Date(file.createdAt).toLocaleDateString()}
                        </p>
                        {file.channel && (
                          <p className="text-[10px] text-cyan-400 mt-0.5">
                            📺 {file.channel.name}
                          </p>
                        )}
                        {!file.channel && (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            ❓ Unassigned
                          </p>
                        )}
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
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="playlists" className="mt-4">
          <PlaylistManager channelId={channelFilter} />
        </TabsContent>
      </Tabs>

      <GoogleDriveDialog
        key={channelFilter}
        open={gdriveOpen}
        onOpenChange={setGdriveOpen}
        channelId={channelFilter}
      />
    </div>
  );
}

function GoogleDriveDialog({
  open,
  onOpenChange,
  channelId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  channelId: string;
}) {
  const queryClient = useQueryClient();
  const [selectedChannelId, setSelectedChannelId] = useState(channelId === "all" || channelId === "unassigned" ? "" : channelId);
  const [currentFolderId, setCurrentFolderId] = useState("root");
  const [folderStack, setFolderStack] = useState<string[]>(["root"]);

  const { data: channelsData } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch("/api/channels");
      const data = await res.json();
      return data.channels as any[];
    },
  });

  const { data: driveFiles, isLoading } = useQuery({
    queryKey: ["gdrive-files", selectedChannelId, currentFolderId],
    queryFn: async () => {
      const res = await fetch("/api/files/google-drive/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: selectedChannelId, folderId: currentFolderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.files as any[];
    },
    enabled: !!selectedChannelId && open,
  });

  const importMutation = useMutation({
    mutationFn: async ({ fileId, fileName }: { fileId: string; fileName: string }) => {
      const res = await fetch("/api/files/google-drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, fileName, channelId: selectedChannelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("File imported from Google Drive");
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openFolder = (fileId: string) => {
    setCurrentFolderId(fileId);
    setFolderStack([...folderStack, fileId]);
  };

  const goBack = () => {
    if (folderStack.length > 1) {
      const newStack = folderStack.slice(0, -1);
      setFolderStack(newStack);
      setCurrentFolderId(newStack[newStack.length - 1]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5 text-amber-300" />
            Import from Google Drive
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Files will be downloaded and assigned to the selected channel
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Select Channel (files will be assigned here)</label>
            <Select
              value={selectedChannelId}
              onValueChange={(v) => {
                setSelectedChannelId(v);
                setCurrentFolderId("root");
                setFolderStack(["root"]);
              }}
            >
              <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                <SelectValue placeholder="Choose a connected channel" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {channelsData?.filter((c) => c.status === "active").map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    {ch.name} — {ch.youtubeChannelName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedChannelId && (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Path: {folderStack.length > 1 ? `My Drive / ...` : "My Drive"}</span>
                {folderStack.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={goBack} className="h-6 ml-auto">
                    Back
                  </Button>
                )}
              </div>

              <ScrollArea className="h-80 rounded-lg border border-slate-800 bg-slate-900/50">
                {isLoading ? (
                  <div className="p-6 text-center">
                    <Loader2 className="h-6 w-6 text-cyan-300 mx-auto animate-spin" />
                  </div>
                ) : !driveFiles || driveFiles.length === 0 ? (
                  <div className="p-6 text-center">
                    <Cloud className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">No files in this folder</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {driveFiles.map((file) => (
                      <div key={file.id} className="flex items-center gap-3 p-3 hover:bg-slate-800/40">
                        {file.mimeType === "application/vnd.google-apps.folder" ? (
                          <button
                            onClick={() => openFolder(file.id)}
                            className="flex items-center gap-3 flex-1 text-left min-w-0"
                          >
                            <FolderOpen className="h-5 w-5 text-amber-300 shrink-0" />
                            <span className="text-sm text-slate-200 truncate">{file.name}</span>
                          </button>
                        ) : (
                          <>
                            <FileVideo className="h-5 w-5 text-cyan-300 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-200 truncate">{file.name}</p>
                              <p className="text-[10px] text-slate-500">
                                {file.size ? `${(parseInt(file.size) / 1024 / 1024).toFixed(1)} MB` : ""}
                                {" • "}{file.mimeType}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => importMutation.mutate({ fileId: file.id, fileName: file.name })}
                              disabled={importMutation.isPending}
                              className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                            >
                              {importMutation.isPending && importMutation.variables?.fileId === file.id ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3 mr-1" />
                              )}
                              Import
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          )}

          {!selectedChannelId && (
            <div className="p-8 text-center rounded-lg border border-slate-800 bg-slate-900/40">
              <Cloud className="h-10 w-10 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                Select a connected channel above to browse its Google Drive
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
