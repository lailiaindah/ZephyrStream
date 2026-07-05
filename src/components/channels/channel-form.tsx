"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { Loader2, Youtube, ExternalLink, Copy } from "lucide-react";

interface ChannelFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingChannel?: any;
}

// Inner form that initializes state from props on mount only (no useEffect)
function ChannelFormInner({
  open,
  onOpenChange,
  editingChannel,
}: ChannelFormProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(editingChannel?.name || "");
  const [description, setDescription] = useState(editingChannel?.description || "");
  const [clientId, setClientId] = useState(editingChannel?.clientId || "");
  const [clientSecret, setClientSecret] = useState(editingChannel?.clientSecret || "");
  const [authCode, setAuthCode] = useState("");
  const [showAuthStep, setShowAuthStep] = useState(false);

  // Create or update channel
  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editingChannel
        ? `/api/channels/${editingChannel.id}`
        : "/api/channels";
      const method = editingChannel ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, clientId, clientSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save channel");
      return data;
    },
    onSuccess: (data) => {
      toast.success(editingChannel ? "Channel updated" : "Channel created");
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      if (!editingChannel) {
        setShowAuthStep(true);
      } else {
        onOpenChange(false);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Get OAuth URL.
  // Note: previously this mutation had an onSuccess that called
  // window.open(url) AND handleAuthorize also called .then(url => window.open)
  // — opening TWO windows (one correct, one about:blank because data was a
  // string, not an object with .authUrl). Now only the onSuccess handler
  // opens the URL; handleAuthorize just calls mutate().
  const authUrlMutation = useMutation({
    mutationFn: async (channelId: string) => {
      const res = await fetch(`/api/channels/${channelId}/auth-url`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get auth URL");
      return data.authUrl as string;
    },
    onSuccess: (url) => {
      window.open(url, "_blank");
      toast.info("Authorization page opened. Copy the code and paste it below.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Exchange code for tokens
  const exchangeMutation = useMutation({
    mutationFn: async ({ channelId, code }: { channelId: string; code: string }) => {
      const res = await fetch(`/api/channels/${channelId}/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to exchange code");
      return data;
    },
    onSuccess: (data) => {
      toast.success("Channel connected to YouTube!");
      if (data.channelInfo) {
        toast.success(`Connected as: ${data.channelInfo.title}`);
      }
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      // Reset form
      setName("");
      setDescription("");
      setClientId("");
      setClientSecret("");
      setAuthCode("");
      setShowAuthStep(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  const handleAuthorize = () => {
    const channelId = editingChannel?.id || saveMutation.data?.channel?.id;
    if (!channelId) return;

    // Just trigger the mutation — the onSuccess handler above opens the
    // URL and shows the toast. (Previously this also called .then() with
    // `data.authUrl` which was undefined since data is the URL string,
    // opening a second about:blank window.)
    authUrlMutation.mutate(channelId);
  };

  // Exchange code extracted from the redirect URL
  const exchangeUrlMutation = useMutation({
    mutationFn: async ({ channelId, redirectUrl }: { channelId: string; redirectUrl: string }) => {
      const res = await fetch(`/api/channels/${channelId}/exchange-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to exchange code");
      return data;
    },
    onSuccess: (data) => {
      toast.success("Channel connected to YouTube!");
      if (data.channelInfo) {
        toast.success(`Connected as: ${data.channelInfo.title}`);
      }
      queryClient.invalidateQueries({ queryKey: ["channels"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      setName("");
      setDescription("");
      setClientId("");
      setClientSecret("");
      setAuthCode("");
      setShowAuthStep(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleExchangeUrl = () => {
    const channelId = editingChannel?.id || saveMutation.data?.channel?.id;
    if (!channelId || !authCode) return;
    exchangeUrlMutation.mutate({ channelId, redirectUrl: authCode });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-cyan-300" />
            {editingChannel ? "Edit Channel" : "Add New Channel"}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Each channel uses its own Google Cloud Console credentials (clientId + clientSecret) to create live broadcasts in YouTube Studio. Streaming itself uses the YouTube stream key — saving API quota.
          </DialogDescription>
        </DialogHeader>

        {!showAuthStep ? (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-slate-200">Channel Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My YouTube Channel"
                required
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-slate-200">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about this channel"
                rows={2}
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clientId" className="text-slate-200">Google Cloud Client ID *</Label>
              <Input
                id="clientId"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxx.apps.googleusercontent.com"
                required
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 font-mono text-xs"
              />
              <p className="text-[11px] text-slate-500">
                From Google Cloud Console → APIs & Services → Credentials
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clientSecret" className="text-slate-200">Google Cloud Client Secret *</Label>
              <Input
                id="clientSecret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-xxxxx"
                required
                type="password"
                className="bg-slate-900 border-slate-700 text-white placeholder:text-slate-500 font-mono text-xs"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                className="bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingChannel ? "Update Channel" : "Create Channel"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-5 py-2">
            <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4">
              <h4 className="text-sm font-semibold text-cyan-300 mb-2">Step 1: Authorize with Google</h4>
              <p className="text-xs text-slate-300 mb-3">
                Click the button to open Google&apos;s authorization page. Sign in with your
                YouTube account and click Allow.
              </p>
              <Button
                onClick={handleAuthorize}
                disabled={authUrlMutation.isPending}
                variant="outline"
                className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
              >
                {authUrlMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-2" />
                )}
                Open Google Authorization
              </Button>
            </div>

            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <h4 className="text-sm font-semibold text-emerald-300 mb-2">
                Step 2: Paste the redirect URL
              </h4>
              <p className="text-xs text-slate-300 mb-3">
                After you authorize, Google will redirect to a page that shows an error
                (like &quot;This site can&apos;t be reached&quot;). That&apos;s normal!
                <br /><br />
                <strong>Copy the full URL from the browser address bar</strong> and paste it below.
                It looks like:
                <code className="block mt-1 p-2 bg-slate-900 rounded text-[10px] text-cyan-300 break-all">
                  http://localhost:3000/api/channels/oauth-callback?code=4/0Axxxxx...
                </code>
              </p>
              <Input
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="http://localhost:3000/api/channels/oauth-callback?code=..."
                className="bg-slate-900 border-slate-700 text-white font-mono text-xs"
              />
              <Button
                onClick={handleExchangeUrl}
                disabled={!authCode || exchangeUrlMutation.isPending}
                className="w-full mt-3 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950"
              >
                {exchangeUrlMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4 mr-2" />
                )}
                Connect Channel
              </Button>
            </div>

            <Button variant="ghost" onClick={() => setShowAuthStep(false)} className="w-full">
              Back to channel details
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Outer wrapper that remounts the inner form when editingChannel changes
// — avoids stale state when switching between create and edit modes.
export function ChannelForm({ open, onOpenChange, editingChannel }: ChannelFormProps) {
  // Use a key based on editingChannel id (or "new") so the inner form
  // remounts and re-initializes its state cleanly when switching targets.
  const formKey = editingChannel?.id || "new";

  return (
    <ChannelFormInner
      key={formKey}
      open={open}
      onOpenChange={onOpenChange}
      editingChannel={editingChannel}
    />
  );
}
