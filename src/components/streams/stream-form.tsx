"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Loader2, Youtube, Key, FileVideo, Settings2, Sparkles, Type, Shuffle, Calendar, Clock, Repeat, Save, FolderOpen, ListVideo } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface StreamFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingStream?: any;
  // When provided, pre-fill the form with this stream's settings but
  // act as "Create New Stream" (not edit). Used by the Copy button.
  copyFromStream?: any;
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
  copyFromStream,
  onSubmit,
  isLoading,
  lockedChannelId,
  channelsData,
  filesData,
}: StreamFormProps & { channelsData: any[]; filesData: any[] }) {
  // Use copyFromStream for pre-filling if provided, else editingStream.
  // In copy mode, startAt is cleared (new schedule) and name gets "(copy)".
  const source = copyFromStream || editingStream;
  const isCopyMode = !!copyFromStream;

  const queryClient = useQueryClient();
  const [name, setName] = useState(isCopyMode ? `${source?.name || ""} (copy)` : (source?.name || ""));
  const [description, setDescription] = useState(source?.description || "");
  const [channelId, setChannelId] = useState<string>(
    lockedChannelId || source?.channelId || ""
  );
  const [streamKey, setStreamKey] = useState(source?.streamKey || "");
  const [sourceType, setSourceType] = useState<"local" | "uploaded">("uploaded");
  const [sourcePath, setSourcePath] = useState(source?.sourcePath || "");
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>(
    source?.sourceFileIds ? JSON.parse(source.sourceFileIds) : []
  );
  // Playlist IDs selected as the source — at stream start, each playlist's
  // videos are resolved and combined with any individually selected files.
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>(
    source?.playlistSourceIds ? JSON.parse(editingStream.playlistSourceIds) : []
  );

  // Clear playlist selections when the channel changes — playlists are
  // channel-scoped, so a playlist selected for Channel A is not valid when
  // the user switches to Channel B. Without this, stale playlist IDs from
  // the old channel remain invisibly in the selection and get sent to the
  // server on save (the playlist picker only shows the current channel's
  // playlists, so the user can't see or uncheck the stale ones).
  useEffect(() => {
    setSelectedPlaylistIds([]);
  }, [channelId]);
  const [shuffle, setShuffle] = useState(source?.shuffle ?? true);
  const [minHours, setMinHours] = useState(source?.minHours ?? 2);
  const [maxHours, setMaxHours] = useState(source?.maxHours ?? 4);
  // Convert the stored UTC startAt to the user's LOCAL timezone for the
  // datetime-local input. Previously this used toISOString().slice(0,16)
  // which produces a UTC string — the browser interprets it as local time,
  // causing the scheduled time to shift by the user's UTC offset on every
  // save. Now we format the Date in local time, which round-trips correctly.
  const [startAt, setStartAt] = useState<string>(() => {
    // In copy mode, clear the start time — user needs to set a new schedule
    if (isCopyMode) return "";
    if (!source?.startAt) return "";
    const d = new Date(source.startAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [autoCreateSchedule, setAutoCreateSchedule] = useState(
    source?.autoCreateSchedule ?? false
  );
  const [shuffleTitle, setShuffleTitle] = useState(source?.shuffleTitle ?? false);
  const [shuffleThumbnail, setShuffleThumbnail] = useState(source?.shuffleThumbnail ?? false);
  const [encoder, setEncoder] = useState(source?.encoder || "auto");
  const [copyMode, setCopyMode] = useState(source?.copyMode || false);
  const [videoBitrate, setVideoBitrate] = useState(source?.videoBitrate || "4500k");
  const [audioBitrate, setAudioBitrate] = useState(source?.audioBitrate || "160k");
  const [resolution, setResolution] = useState(source?.resolution || "1920x1080");
  const [fps, setFps] = useState(source?.fps || 30);
  const [preset, setPreset] = useState(source?.preset || "veryfast");
  const [privacyStatus, setPrivacyStatus] = useState(source?.privacyStatus || "public");
  const [categoryId, setCategoryId] = useState(source?.categoryId || "22");
  const [tags, setTags] = useState(source?.tags || "");
  const [playlistId, setPlaylistId] = useState(source?.playlistId || "");
  const [alteredContent, setAlteredContent] = useState(source?.alteredContent || false);
  const [spinnerMode, setSpinnerMode] = useState(source?.spinnerMode || "off");
  const [selectedEmojis, setSelectedEmojis] = useState<string[]>(
    source?.spinnerEmojis ? JSON.parse(editingStream.spinnerEmojis) : []
  );

  // Fetch user's files (filtered by channelId when locked)
  // — actually data is now passed via props from the outer wrapper

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation: ensure there's a source before submitting.
    // The backend will reject anyway, but this gives the user immediate
    // inline feedback instead of a generic error toast.
    if (sourceType === "local" && !sourcePath.trim()) {
      toast.error("Please enter a local folder path, or switch to Uploaded Files source.");
      return;
    }
    if (sourceType === "uploaded" && selectedFileIds.length === 0 && selectedPlaylistIds.length === 0) {
      toast.error("Please select at least one uploaded file or playlist, or switch to Local Path source.");
      return;
    }

    // Validate duration: minHours must be <= maxHours
    if (Number(minHours) > Number(maxHours)) {
      toast.error("Minimum duration cannot be greater than maximum duration.");
      return;
    }

    onSubmit({
      name,
      description,
      channelId: channelId || null,
      streamKey,
      sourceType: sourceType === "local" ? "local" : "uploaded",
      sourcePath: sourceType === "local" ? sourcePath : null,
      sourceFileIds: sourceType === "uploaded" ? selectedFileIds : null,
      // Only include playlist IDs when source type is "uploaded"
      playlistSourceIds: sourceType === "uploaded" ? selectedPlaylistIds : null,
      shuffle,
      minHours: Number(minHours),
      maxHours: Number(maxHours),
      startAt: startAt ? new Date(startAt).toISOString() : null,
      autoCreateSchedule,
      shuffleTitle,
      shuffleThumbnail,
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

  const togglePlaylist = (id: string) => {
    setSelectedPlaylistIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  // Fetch playlists for the SELECTED channel only. When a specific
  // channel is selected (either locked via the Streams page filter, or
  // picked from the channel dropdown in the form), only that channel's
  // playlists are shown. When no channel is selected, the playlist
  // picker shows "Select a channel to see its playlists".
  //
  // This is the correct behavior: playlists are channel-scoped
  // collections of videos. If you're creating a stream for Channel A,
  // you should only see Channel A's playlists — not playlists from
  // other channels.
  const { data: playlistsData } = useQuery({
    queryKey: ["playlists", channelId],
    queryFn: async () => {
      if (!channelId) return [];
      const res = await fetch(`/api/playlists?channelId=${channelId}`);
      const data = await res.json();
      return (data.playlists as any[]) || [];
    },
    enabled: !!channelId,
  });

  // Insert a variable token at the cursor position in the description textarea.
  // Falls back to appending at the end if cursor position can't be determined.
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const insertVariable = (token: string) => {
    const textarea = descriptionRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = description.slice(0, start) + token + description.slice(end);
      setDescription(newText);
      // Move cursor to after the inserted token
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }, 0);
    } else {
      setDescription((prev) => `${prev}${token}`);
    }
  };

  // === TEMPLATE FEATURES ===
  const { data: templates } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const res = await fetch("/api/templates");
      const data = await res.json();
      return (data.templates as any[]) || [];
    },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: async (templateName: string) => {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          encoder, copyMode, videoBitrate, audioBitrate, resolution, fps, preset,
          privacyStatus, categoryId, tags, playlistId, alteredContent,
          minHours, maxHours, spinnerMode,
          spinnerEmojis: selectedEmojis && selectedEmojis.length > 0
            ? JSON.stringify(selectedEmojis)
            : null,
          autoCreateSchedule,
          shuffleTitle,
          shuffleThumbnail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Template saved!");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const loadTemplate = (templateId: string) => {
    const t = templates?.find((t) => t.id === templateId);
    if (!t) return;
    setEncoder(t.encoder || "auto");
    setCopyMode(t.copyMode ?? false);
    setVideoBitrate(t.videoBitrate || "4500k");
    setAudioBitrate(t.audioBitrate || "160k");
    setResolution(t.resolution || "1920x1080");
    setFps(t.fps || 30);
    setPreset(t.preset || "veryfast");
    setPrivacyStatus(t.privacyStatus || "public");
    setCategoryId(t.categoryId || "22");
    setTags(t.tags || "");
    setPlaylistId(t.playlistId || "");
    setAlteredContent(t.alteredContent ?? false);
    setMinHours(t.minHours ?? 2);
    setMaxHours(t.maxHours ?? 4);
    setSpinnerMode(t.spinnerMode || "off");
    setSelectedEmojis(t.spinnerEmojis ? JSON.parse(t.spinnerEmojis) : []);
    setAutoCreateSchedule(t.autoCreateSchedule ?? false);
    setShuffleTitle(t.shuffleTitle ?? false);
    setShuffleThumbnail(t.shuffleThumbnail ?? false);
    toast.success(`Loaded template: ${t.name}`);
  };

  const handleSaveTemplate = () => {
    const templateName = prompt("Enter template name:", `${name} - Preset`);
    if (!templateName) return;
    saveTemplateMutation.mutate(templateName);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-cyan-300" />
            {isCopyMode ? "Copy Stream Settings" : (editingStream ? "Edit Stream" : "Create New Stream")}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Configure a live stream. Streaming uses the YouTube stream key (not the API) — saving your Google Cloud quota.
          </DialogDescription>
        </DialogHeader>

        {/* Template selector + save button */}
        <div className="flex items-center gap-2 p-3 rounded-lg border border-slate-800 bg-slate-900/60">
          <FolderOpen className="h-4 w-4 text-cyan-300 shrink-0" />
          <Select value="" onValueChange={(v) => v && loadTemplate(v)}>
            <SelectTrigger className="flex-1 bg-slate-900 border-slate-700 text-white">
              <SelectValue placeholder="Load from template..." />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-700">
              {(templates || []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSaveTemplate}
            disabled={saveTemplateMutation.isPending}
            className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
          >
            {saveTemplateMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Save as Template
          </Button>
        </div>

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
                  ref={descriptionRef}
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

                <div className="flex items-center justify-between rounded-md bg-slate-900/60 border border-slate-800 p-2.5">
                  <div className="flex items-center gap-2">
                    <Shuffle className="h-4 w-4 text-cyan-300" />
                    <div>
                      <Label className="text-slate-200 cursor-pointer">Shuffle Title (Random Pick)</Label>
                      <p className="text-[11px] text-slate-500">
                        Pick a RANDOM title from the channel&apos;s title list each time a schedule is created (can repeat)
                      </p>
                    </div>
                  </div>
                  <Switch checked={shuffleTitle} onCheckedChange={setShuffleTitle} />
                </div>

                <div className="flex items-center justify-between rounded-md bg-slate-900/60 border border-slate-800 p-2.5">
                  <div className="flex items-center gap-2">
                    <Shuffle className="h-4 w-4 text-emerald-300" />
                    <div>
                      <Label className="text-slate-200 cursor-pointer">Shuffle Thumbnail (Random Pick)</Label>
                      <p className="text-[11px] text-slate-500">
                        Pick a RANDOM thumbnail from the channel&apos;s thumbnail list each time (can repeat)
                      </p>
                    </div>
                  </div>
                  <Switch checked={shuffleThumbnail} onCheckedChange={setShuffleThumbnail} />
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
                <div className="space-y-4">
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

                  {/* === Playlist selector === */}
                  <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-emerald-200 flex items-center gap-1.5">
                        <ListVideo className="h-4 w-4 text-emerald-300" />
                        Or pick from Playlists
                      </Label>
                      {selectedPlaylistIds.length > 0 && (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                          {selectedPlaylistIds.length} playlist(s)
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Pick one or more playlists. Their videos will be combined with the
                      individually-selected files above and played in order. If shuffle is
                      ON, the combined queue is randomized.
                    </p>
                    <div className="max-h-48 overflow-y-auto rounded-md border border-slate-800 bg-slate-900/50">
                      {!channelId ? (
                        <div className="p-4 text-center text-[11px] text-slate-500">
                          Select a channel to see its playlists
                        </div>
                      ) : !playlistsData || playlistsData.length === 0 ? (
                        <div className="p-4 text-center text-[11px] text-slate-500">
                          No playlists for this channel yet — go to Files → Playlists tab to create one
                        </div>
                      ) : (
                        playlistsData.map((p) => {
                          const count = p.itemCount ?? p.items?.length ?? 0;
                          return (
                            <label
                              key={p.id}
                              className={cn(
                                "flex items-center gap-3 p-2.5 cursor-pointer border-b border-slate-800 last:border-0 transition-colors",
                                selectedPlaylistIds.includes(p.id)
                                  ? "bg-emerald-500/10"
                                  : "hover:bg-slate-800/40"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={selectedPlaylistIds.includes(p.id)}
                                onChange={() => togglePlaylist(p.id)}
                                className="rounded border-slate-600"
                              />
                              <ListVideo className="h-4 w-4 text-emerald-300 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-slate-200 truncate">
                                  {p.name}
                                </p>
                                <p className="text-[10px] text-slate-500">
                                  {count} video(s)
                                  {p.shuffleOwn === true
                                    ? " • shuffle ON"
                                    : p.shuffleOwn === false
                                    ? " • shuffle OFF"
                                    : ""}
                                </p>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Summary of total sources */}
                  {(selectedFileIds.length > 0 || selectedPlaylistIds.length > 0) && (
                    <div className="text-[11px] text-cyan-300 bg-cyan-500/5 border border-cyan-500/20 rounded p-2">
                      Total source: {selectedFileIds.length} individual file(s)
                      {selectedPlaylistIds.length > 0 &&
                        ` + ${selectedPlaylistIds.length} playlist(s)`}
                      {shuffle ? " • will be shuffled at stream start" : " • will play in listed order"}
                    </div>
                  )}
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
              {editingStream ? "Update Stream" : (isCopyMode ? "Create Stream" : "Create Stream")}
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
  copyFromStream,
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

  // Use a key based on editingStream/copyFromStream id (or "new") so the
  // inner form remounts and re-initializes its state cleanly when switching.
  const formKey = editingStream?.id || copyFromStream?.id || "new";

  return (
    <StreamFormInner
      key={formKey}
      open={open}
      onOpenChange={onOpenChange}
      editingStream={editingStream}
      copyFromStream={copyFromStream}
      onSubmit={onSubmit}
      isLoading={isLoading}
      lockedChannelId={lockedChannelId}
      channelsData={channelsData || []}
      filesData={filesData || []}
    />
  );
}
