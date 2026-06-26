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
import {
  UploadCloud,
  HardDrive,
  FileVideo,
  Trash2,
  Loader2,
  Cloud,
  FolderOpen,
  CheckCircle2,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function FileManager() {
  const queryClient = useQueryClient();
  const [gdriveOpen, setGdriveOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["files"],
    queryFn: async () => {
      const res = await fetch("/api/files");
      const data = await res.json();
      return data.files as any[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
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
      toast.success(`${data.files.length} file(s) uploaded`);
      queryClient.invalidateQueries({ queryKey: ["files"] });
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
      queryClient.invalidateQueries({ queryKey: ["files"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">File Manager</h2>
          <p className="text-sm text-slate-400">
            Upload video files from PC or import from Google Drive
          </p>
        </div>
        <Button
          onClick={() => setGdriveOpen(true)}
          variant="outline"
          className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
        >
          <Cloud className="h-4 w-4 mr-2" />
          Google Drive
        </Button>
      </div>

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
              <p className="text-sm text-slate-300">Uploading files...</p>
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
                Supports multiple files: MP4, MOV, MKV, AVI, WebM, TS, FLV
              </p>
            </>
          )}
        </div>
      </Card>

      {/* File list */}
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
          <p className="text-sm text-slate-400">No files uploaded yet</p>
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
                    <p className="text-sm font-medium text-white truncate">{file.originalName}</p>
                    <p className="text-xs text-slate-500">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      {new Date(file.createdAt).toLocaleDateString()}
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
              </div>
            </Card>
          ))}
        </div>
      )}

      <GoogleDriveDialog open={gdriveOpen} onOpenChange={setGdriveOpen} />
    </div>
  );
}

function GoogleDriveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [channelId, setChannelId] = useState("");
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
    queryKey: ["gdrive-files", channelId, currentFolderId],
    queryFn: async () => {
      const res = await fetch("/api/files/google-drive/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, folderId: currentFolderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.files as any[];
    },
    enabled: !!channelId && open,
  });

  const importMutation = useMutation({
    mutationFn: async ({ fileId, fileName }: { fileId: string; fileName: string }) => {
      const res = await fetch("/api/files/google-drive/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, fileName, channelId }),
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

  const openFolder = (fileId: string, fileName: string) => {
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
            Uses the connected channel's OAuth credentials to access Google Drive
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-slate-400">Select Channel</label>
            <Select value={channelId} onValueChange={(v) => { setChannelId(v); setCurrentFolderId("root"); setFolderStack(["root"]); }}>
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

          {channelId && (
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
                            onClick={() => openFolder(file.id, file.name)}
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

          {!channelId && (
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
