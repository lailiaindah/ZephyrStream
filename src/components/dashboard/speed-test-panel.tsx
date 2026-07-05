"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gauge, Loader2, Zap, Download, Upload, Activity, Globe, Server, ExternalLink, AlertCircle } from "lucide-react";

interface SpeedTestResult {
  downloadSpeed: number;
  uploadSpeed: number;
  latencyMs: number;
  jitterMs: number;
  packetLoss: number;
  server: {
    id: number;
    name: string;
    location: string;
    country: string;
    host: string;
  };
  isp: string;
  externalIp: string;
  internalIp: string;
  resultUrl: string;
  usedOokla: boolean;
  timestamp: string;
}

export function SpeedTestPanel() {
  const [result, setResult] = useState<SpeedTestResult | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/system/speed-test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speed test failed");
      return data as SpeedTestResult;
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.usedOokla) {
        toast.success(`Ookla Speedtest complete: ↓${data.downloadSpeed} Mbps ↑${data.uploadSpeed} Mbps`);
      } else {
        toast.info(`Speed test complete (legacy mode): ${data.downloadSpeed} Mbps`);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card className="border-slate-800/60 bg-slate-900/40 backdrop-blur-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              Internet Speed Test
              {result?.usedOokla && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-300 border border-pink-500/30 font-semibold">
                  Ookla
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {result?.usedOokla
                ? "Official Ookla Speedtest CLI"
                : "Test download speed (install Ookla CLI for full test)"}
            </p>
          </div>
          <Gauge className="h-5 w-5 text-cyan-300 shrink-0" />
        </div>

        {mutation.isPending ? (
          <div className="rounded-lg bg-slate-950/50 border border-cyan-500/30 p-6 mb-4 text-center">
            <Loader2 className="h-8 w-8 text-cyan-300 mx-auto mb-2 animate-spin" />
            <p className="text-xs text-cyan-300 font-medium">
              Running Ookla Speedtest...
            </p>
            <p className="text-[10px] text-slate-500 mt-1">
              This can take 15-30 seconds (download + upload phases)
            </p>
          </div>
        ) : result ? (
          <div className="space-y-3 mb-4">
            {/* Download + Upload grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-950/50 border border-slate-800/60 p-3">
                <div className="flex items-center gap-1 mb-1">
                  <Download className="h-3 w-3 text-cyan-300" />
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Download</p>
                </div>
                <p className="text-xl font-bold text-cyan-300">
                  {result.downloadSpeed.toFixed(2)}
                  <span className="text-xs text-slate-400 ml-1">Mbps</span>
                </p>
              </div>
              <div className="rounded-lg bg-slate-950/50 border border-slate-800/60 p-3">
                <div className="flex items-center gap-1 mb-1">
                  <Upload className="h-3 w-3 text-emerald-300" />
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Upload</p>
                </div>
                <p className="text-xl font-bold text-emerald-300">
                  {result.uploadSpeed > 0 ? result.uploadSpeed.toFixed(2) : "—"}
                  {result.uploadSpeed > 0 && (
                    <span className="text-xs text-slate-400 ml-1">Mbps</span>
                  )}
                </p>
              </div>
            </div>

            {/* Ping / Jitter / Packet Loss */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-slate-950/50 border border-slate-800/60 p-2 text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <Activity className="h-2.5 w-2.5 text-amber-300" />
                  <p className="text-[9px] uppercase tracking-wider text-slate-500">Ping</p>
                </div>
                <p className="text-sm font-bold text-amber-300">
                  {result.latencyMs.toFixed(1)}<span className="text-[9px] text-slate-500 ml-0.5">ms</span>
                </p>
              </div>
              <div className="rounded-md bg-slate-950/50 border border-slate-800/60 p-2 text-center">
                <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Jitter</p>
                <p className="text-sm font-bold text-slate-300">
                  {result.jitterMs.toFixed(1)}<span className="text-[9px] text-slate-500 ml-0.5">ms</span>
                </p>
              </div>
              <div className="rounded-md bg-slate-950/50 border border-slate-800/60 p-2 text-center">
                <p className="text-[9px] uppercase tracking-wider text-slate-500 mb-0.5">Loss</p>
                <p className={`text-sm font-bold ${result.packetLoss > 0 ? "text-rose-300" : "text-emerald-300"}`}>
                  {result.packetLoss.toFixed(2)}<span className="text-[9px] text-slate-500 ml-0.5">%</span>
                </p>
              </div>
            </div>

            {/* Server info */}
            {result.usedOokla && (
              <div className="rounded-lg bg-slate-950/40 border border-slate-800/60 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <Server className="h-3 w-3 text-slate-500 shrink-0" />
                  <span className="text-slate-500">Server:</span>
                  <span className="text-slate-300 truncate">
                    {result.server.name}
                    {result.server.location && ` · ${result.server.location}`}
                    {result.server.country && `, ${result.server.country}`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Globe className="h-3 w-3 text-slate-500 shrink-0" />
                  <span className="text-slate-500">ISP:</span>
                  <span className="text-slate-300 truncate">
                    {result.isp || "—"}
                    {result.externalIp && ` · ${result.externalIp}`}
                  </span>
                </div>
                {result.resultUrl && (
                  <a
                    href={result.resultUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 underline"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">View result on speedtest.net</span>
                  </a>
                )}
              </div>
            )}

            {/* Timestamp */}
            <p className="text-[10px] text-slate-600 text-center">
              Tested at {new Date(result.timestamp).toLocaleString()}
            </p>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-950/50 border border-slate-800/60 p-4 mb-4 text-center">
            <Zap className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500 mb-1">No speed test yet</p>
            <p className="text-[10px] text-slate-600">
              Uses Ookla Speedtest CLI when installed
            </p>
          </div>
        )}

        {!result?.usedOokla && !mutation.isPending && (
          <div className="mb-3 p-2 rounded-md bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-300 flex items-start gap-1.5">
            <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
            <span>
              Ookla CLI not detected — using legacy single-file download.
              Install Ookla CLI for upload + ping + server info:
              {" "}
              <a
                href="https://www.speedtest.net/apps/cli"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-amber-200"
              >
                speedtest.net/apps/cli
              </a>
            </span>
          </div>
        )}

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="w-full bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-semibold"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testing... (15-30s)
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Run Ookla Speedtest
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
