"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ENCODER_CHOICES, PRIVACY_OPTIONS, SPINNER_MODES, YOUTUBE_CATEGORIES, EMOJI_CATALOG, PRESET_CHOICES } from "@/lib/constants";
import { Loader2, Youtube, Key, FileVideo, Settings2, Sparkles, Type, Shuffle, Calendar, Clock, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreamFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingStream?: any;
  onSubmit: (data: any) => void;
  isLoading?: boolean;
  // When provided, restrict the channel selector to this channel only
  lockedChannelId?: string;
}

// Inner form that initializes state from props on mount only (no useEffect)
function StreamFormInner({
  open,
  onOpenChange,
  editingStream,
  onSubmit,
  isLoading,
  lockedChannelId,
  channelsData,
  filesData,
}: StreamFormProps & { channelsData: any[]; filesData: any[] }) {
  const [name, setName] = useState(editingStream?.name || "");
  const [description, setDescription] = useState(editingStream?.description || "");
  const [channelId, setChannelId] = useState<string>(
    lockedChannelId || editingStream?.channelId || ""
  );
  const [streamKey, setStreamKey] = useState(editingStream?.streamKey || "");
  const [sourceType, setSourceType] = useState<"local" | "uploaded">("uploaded");
  const [sourcePath, setSourcePath] = useState(editingStream?.sourcePath || "");
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(
    editingStream?.sourceFileIds ? JSON.parse(editingStream.sourceFileIds) : []
  );
  const [shuffle, setShuffle] = useState(editingStream?.shuffle ?? true);
  const [minHours, setMinHours] = useState(editingStream?.minHours ?? 2);
  const [maxHours, setMaxHours] = useState(editingStream?.maxHours ?? 4);
  const [startAt, setStartAt] = useState<string>(
    editingStream?.startAt
      ? new Date(editingStream.startAt).toISOString().slice(0, 16)
      : ""
  );
  const [autoCreateSchedule, setAutoCreateSchedule] = useState(
    editingStream?.autoCreateSchedule ?? false
  );
  const [encoder, setEncoder] = useState(editingStream?.encoder || "auto");
  const [copyMode, setCopyMode] = useState(editingStream?.copyMode || false);
  const [videoBitrate, setVideoBitrate] = useState(editingStream?.videoBitrate || "4500k");
  const [audioBitrate, setAudioBitrate] = useState(editingStream?.audioBitrate || "160k");
  const [resolution, setResolution] = useState(editingStream?.resolution || "1920x1080");
  const [fps, setFps] = useState(editingStream?.fps || 30);
  const [preset, setPreset] = useState(editingStream?.preset || "veryfast");
  const [privacyStatus, setPrivacyStatus] = useState(editingStream?.privacyStatus || "public");
  const [categoryId, setCategoryId] = useState(editingStream?.categoryId || "22");
  const [tags, setTags] = useState(editingStream?.tags || "");
  const [playlistId, setPlaylistId] = useState(editingStream?.playlistId || "");
  const [alteredContent, setAlteredContent] = useState(editingStream?.alteredContent || false);
  const [spinnerMode, setSpinnerMode] = useState(editingStream?.spinnerMode || "off");
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>(
    editingStream?.spinnerEmojis ? JSON.parse(editingStream.spinnerEmojis) : []
  );

  // Fetch user's files (filtered by channelId when locked)
  // — actually data is now passed via props from the outer wrapper

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description,
      channelId: channelId || null,
      streamKey,
      sourceType: sourceType === "local" ? "local" : "uploaded",
      sourcePath: sourceType === "local" ? sourcePath : null,
      sourceFileIds: sourceType === "uploaded" ? selectedFileIds : null,
      shuffle,
      minHours: Number(minHours),
      maxHours: Number(maxHours),
      startAt: startAt ? new Date(startAt).toISOString() : null,
      autoCreateSchedule,
      encoder,
      copyMode,
      videoBitrate,
      audioBitrate,
      resolution,
      fps: Number(fps),
      preset,
      privacyStatus,
      categoryId,
      tags,
      playlistId: playlistId.trim() || null,
      alteredContent,
      spinnerMode,
      spinnerEmojis: selectedEmojis,
    });
  };

  const toggleEmoji = (emoji: string) => {
    setSelectedEmojis((prev) =>
      prev.includes(emoji) ? prev.filter((e) => e !== emoji) : [...prev, emoji]
    );
  };

  const toggleFile = (id: string) => {
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );
  };

  const insertVariable = (token: string) => {
    setDescription((prev) => `${prev}${token}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-cyan-300" />
            {editingStream ? "Edit Stream" : "Create New Stream"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure a live stream. Streaming uses the YouTube stream key (not the API) — saving your Google Cloud quota.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-slate-900 border border-slate-800">
              <TabsTrigger value="basic" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300">
                <Key className="h-3.5 w-3.5 mr-1.5" /> Basic
              </TabsTrigger>
              <TabsTrigger value="source" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300">
                <FileVideo className="h-3.5 w-3.5 mr-1.5" /> Source
              </TabsTrigger>
              <TabsTrigger value="ffmpeg" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300">
                <Settings2 className="h-3.5 w-3.5 mr-1.5" /> FFmpeg
              </TabsTrigger>
              <TabsTrigger value="spinner" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Spinner
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label className="text-slate-200">Stream Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Live Stream"
                  required
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-slate-200">Description</Label>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => insertVariable("[title]")}
                      className="h-6 px-2 text-[10px] border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
                    >
                      + [title]
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => insertVariable("[date]")}
                      className="h-6 px-2 text-[10px] border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      + [date]
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => insertVariable("[time]")}
                      className="h-6 px-2 text-[10px] border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      + [time]
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => insertVariable("[datetime]")}
                      className="h-6 px-2 text-[10px] border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      + [datetime]
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Stream description. Click [title] above to insert the current stream title..."
                  rows={4}
                  className="bg-slate-900 border-slate-700 text-white"
                />
                <p className="text-[11px] text-slate-500">
                  Variables are replaced at stream time. <code className="text-cyan-300">[title]</code> uses the title picked from this channel&apos;s title list.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-200">YouTube Channel</Label>
                  {lockedChannelId ? (
                    <Input
                      value={channelsData?.find((c) => c.id === lockedChannelId)?.name || "Locked channel"}
                      disabled
                      className="bg-slate-900/50 border-slate-800 text-slate-400"
                    />
                  ) : (
                    <Select value={channelId || "_none"} onValueChange={(v) => setChannelId(v === "_none" ? "" : v)}>
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                        <SelectValue placeholder="No channel" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="_none">No channel</SelectItem>
                        {channelsData?.map((ch) => (
                          <SelectItem key={ch.id} value={ch.id}>
                            {ch.name} {ch.status === "active" ? "✓" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <p className="text-[11px] text-slate-500">
                    If selected, broadcast will be auto-created via API
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-200">Duration (hours, randomized)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={minHours}
                      onChange={(e) => setMinHours(Number(e.target.value))}
                      min={0.5}
                      max={24}
                      step={0.5}
                      className="bg-slate-900 border-slate-700 text-white"
                    />
                    <span className="text-slate-400 text-sm">to</span>
                    <Input
                      type="number"
                      value={maxHours}
                      onChange={(e) => setMaxHours(Number(e.target.value))}
                      min={0.5}
                      max={48}
                      step={0.5}
                      className="bg-slate-900 border-slate-700 text-white"
                    />
                    <span className="text-slate-400 text-sm">hrs</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Stream duration will be randomized between these values
                  </p>
                </div>
              </div>

              {/* Schedule date & time picker */}
              <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-cyan-300" />
                  <Label className="text-cyan-300 font-semibold">Schedule (auto-start)</Label>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-200 flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Start Date &amp; Time
                  </Label>
                  <Input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white"
                  />
                  <p className="text-[11px] text-slate-500">
                    {startAt
                      ? `Stream will auto-start at ${new Date(startAt).toLocaleString()}`
                      : "Leave empty for manual start (click Start button anytime)"}
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-md bg-slate-900/60 border border-slate-800 p-2.5">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-emerald-300" />
                    <div>
                      <Label className="text-slate-200 cursor-pointer">Auto Create Next Schedule</Label>
                      <p className="text-[11px] text-slate-500">
                        Auto-create a new stream for tomorrow (startAt + 24h) with same stream key when this stream ends or errors
                      </p>
                    </div>
                  </div>
                  <Switch checked={autoCreateSchedule} onCheckedChange={setAutoCreateSchedule} />
                </div>
              </div>

              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
                <Label className="text-rose-300 flex items-center gap-1.5 mb-2">
                  <Key className="h-3.5 w-3.5" />
                  YouTube Stream Key *
                </Label>
                <Input
                  value={streamKey}
                  onChange={(e) => setStreamKey(e.target.value)}
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                  required
                  className="bg-slate-900 border-slate-700 text-white font-mono text-xs"
                />
                <p className="text-[11px] text-slate-400 mt-2">
                  Get this from YouTube Studio → Create → Go live → Stream settings.
                  FFmpeg will use this key to push video to YouTube — <strong className="text-rose-300">no API quota used for streaming</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-200">Post-Live Replay Status</Label>
                  <Select value={privacyStatus} onValueChange={setPrivacyStatus}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {PRIVACY_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-slate-500">
                    Live event is always public; this controls the replay
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-200">Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {Object.entries(YOUTUBE_CATEGORIES).map(([id, name]) => (
                        <SelectItem key={id} value={id}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-200">Tags (comma-separated)</Label>
                <Input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="music, live, gaming"
                  className="bg-slate-900 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-200">YouTube Playlist ID (optional)</Label>
                <Input
                  value={playlistId}
                  onChange={(e) => setPlaylistId(e.target.value)}
                  placeholder="PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="bg-slate-900 border-slate-700 text-white font-mono text-xs"
                />
                <p className="text-[11px] text-slate-500">
                  Add this broadcast to a YouTube playlist. Find the ID in the playlist URL
                  (e.g. <code className="text-cyan-300">youtube.com/playlist?list=PL...</code> → use the part after <code className="text-cyan-300">list=</code>)
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-900/60 border border-slate-800 p-3">
                <div>
                  <Label className="text-slate-200 cursor-pointer">Altered Content</Label>
                  <p className="text-[11px] text-slate-500">
                    Mark broadcast as containing altered or synthetic content (YouTube policy)
                  </p>
                </div>
                <Switch checked={alteredContent} onCheckedChange={setAlteredContent} />
              </div>
            </TabsContent>

            <TabsContent value="source" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label className="text-slate-200">Source Type</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSourceType("uploaded")}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all",
                      sourceType === "uploaded"
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                        : "border-slate-700 bg-slate-900 text-slate-400"
                    )}
                  >
                    <FileVideo className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Uploaded Files</span>
                    <span className="text-[10px] mt-0.5">From PC or Google Drive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceType("local")}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all",
                      sourceType === "local"
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                        : "border-slate-700 bg-slate-900 text-slate-400"
                    )}
                  >
                    <Settings2 className="h-5 w-5 mb-1" />
                    <span className="text-sm font-medium">Local Path</span>
                    <span className="text-[10px] mt-0.5">VPS folder path</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-900/60 border border-slate-800 p-3">
                <div className="flex items-center gap-2">
                  <Shuffle className="h-4 w-4 text-cyan-300" />
                  <div>
                    <Label className="text-slate-200 cursor-pointer">Shuffle Video Order</Label>
                    <p className="text-[11px] text-slate-500">Randomize playback order each stream</p>
                  </div>
                </div>
                <Switch checked={shuffle} onCheckedChange={setShuffle} />
              </div>

              {sourceType === "local" ? (
                <div className="space-y-1.5">
                  <Label className="text-slate-200">Local Folder Path on VPS</Label>
                  <Input
                    value={sourcePath}
                    onChange={(e) => setSourcePath(e.target.value)}
                    placeholder="/home/user/videos"
                    className="bg-slate-900 border-slate-700 text-white font-mono text-xs"
                  />
                  <p className="text-[11px] text-slate-500">
                    All video files in this folder will be used (mp4, mov, mkv, avi, webm, ts, flv)
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-slate-200">Select Uploaded Files</Label>
                    {selectedFileIds.length > 0 && (
                      <Badge variant="outline" className="border-cyan-500/40 text-cyan-300">
                        {selectedFileIds.length} selected
                      </Badge>
                    )}
                  </div>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50">
                    {!filesData || filesData.length === 0 ? (
                      <div className="p-6 text-center">
                        <FileVideo className="h-8 w-8 text-slate-700 mx-auto mb-2" />
                        <p className="text-xs text-slate-500">
                          {channelId
                            ? "No files uploaded to this channel yet."
                            : "No files uploaded yet. Go to the Files tab to upload."}
                        </p>
                      </div>
                    ) : (
                      filesData.map((file) => (
                        <label
                          key={file.id}
                          className={cn(
                            "flex items-center gap-3 p-3 cursor-pointer border-b border-slate-800 last:border-0 transition-colors",
                            selectedFileIds.includes(file.id)
                              ? "bg-cyan-500/10"
                              : "hover:bg-slate-800/40"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFileIds.includes(file.id)}
                            onChange={() => toggleFile(file.id)}
                            className="rounded border-slate-600"
                          />
                          <FileVideo className="h-4 w-4 text-cyan-300 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-200 truncate">
                              {file.originalName}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {file.size != null ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "—"} • {file.mimeType || "unknown"}
                            </p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="ffmpeg" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-200">Encoder</Label>
                  <Select value={encoder} onValueChange={setEncoder}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {ENCODER_CHOICES.map((e) => (
                        <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-200">Resolution</Label>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="3840x2160">4K (3840×2160)</SelectItem>
                      <SelectItem value="2560x1440">1440p (2560×1440)</SelectItem>
                      <SelectItem value="1920x1080">1080p (1920×1080)</SelectItem>
                      <SelectItem value="1280x720">720p (1280×720)</SelectItem>
                      <SelectItem value="854x480">480p (854×480)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-200">Video Bitrate</Label>
                  <Input
                    value={videoBitrate}
                    onChange={(e) => setVideoBitrate(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-200">Audio Bitrate</Label>
                  <Input
                    value={audioBitrate}
                    onChange={(e) => setAudioBitrate(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-200">FPS</Label>
                  <Select value={fps.toString()} onValueChange={(v) => setFps(Number(v))}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="24">24</SelectItem>
                      <SelectItem value="30">30</SelectItem>
                      <SelectItem value="60">60</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-200">Encoder Preset</Label>
                <Select value={preset} onValueChange={setPreset}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {PRESET_CHOICES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-slate-900/60 border border-slate-800 p-3">
                <div>
                  <Label className="text-slate-200 cursor-pointer">Copy Mode</Label>
                  <p className="text-[11px] text-slate-500">
                    Stream without re-encoding (faster, all videos must share specs)
                  </p>
                </div>
                <Switch checked={copyMode} onCheckedChange={setCopyMode} />
              </div>
            </TabsContent>

            <TabsContent value="spinner" className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label className="text-slate-200">Spinner Mode (Anti-Spam)</Label>
                <Select value={spinnerMode} onValueChange={setSpinnerMode}>
                  <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    {SPINNER_MODES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-slate-500">
                  Adds varied emojis to stream titles to avoid YouTube spam detection
                </p>
              </div>

              {spinnerMode !== "off" && (
                <div className="space-y-3">
                  <Label className="text-slate-200">Select Emojis</Label>
                  {Object.entries(EMOJI_CATALOG).map(([category, emojis]) => (
                    <div key={category}>
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{category}</p>
                      <div className="flex flex-wrap gap-1">
                        {emojis.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => toggleEmoji(emoji)}
                            className={cn(
                              "h-8 w-8 rounded-md text-lg flex items-center justify-center transition-all",
                              selectedEmojis.includes(emoji)
                                ? "bg-cyan-500/30 border border-cyan-500/50"
                                : "bg-slate-900/40 border border-transparent hover:bg-slate-800"
                            )}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {selectedEmojis.length > 0 && (
                    <p className="text-xs text-cyan-300">
                      {selectedEmojis.length} emoji(s) selected: {selectedEmojis.join(" ")}
                    </p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950"
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingStream ? "Update Stream" : "Create Stream"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Outer wrapper that fetches shared data and remounts the inner form
// when editingStream changes — avoids setState-in-effect warnings.
export function StreamForm({
  open,
  onOpenChange,
  editingStream,
  onSubmit,
  isLoading,
  lockedChannelId,
}: StreamFormProps) {
  // Fetch user's channels (only when not locked)
  const { data: channelsData } = useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch("/api/channels");
      const data = await res.json();
      return (data.channels as any[]) || [];
    },
    enabled: !lockedChannelId,
  });

  // Fetch user's files (for the source picker)
  const { data: filesData } = useQuery({
    queryKey: ["files", lockedChannelId || "all"],
    queryFn: async () => {
      const url = lockedChannelId
        ? `/api/files?channelId=${lockedChannelId}`
        : "/api/files";
      const res = await fetch(url);
      const data = await res.json();
      return (data.files as any[]) || [];
    },
  });

  // Use a key based on editingStream id (or "new") so the inner form
  // remounts and re-initializes its state cleanly when switching targets.
  const formKey = editingStream?.id || "new";

  return (
    <StreamFormInner
      key={formKey}
      open={open}
      onOpenChange={onOpenChange}
      editingStream={editingStream}
      onSubmit={onSubmit}
      isLoading={isLoading}
      lockedChannelId={lockedChannelId}
      channelsData={channelsData || []}
      filesData={filesData || []}
    />
  );
}
