"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gauge, Loader2, Zap } from "lucide-react";

interface SpeedTestResult {
  downloadSpeed: number;
  latencyMs: number;
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
      toast.success(`Speed test complete: ${data.downloadSpeed} Mbps`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card className="border-slate-800/60 bg-slate-900/40 backdrop-blur-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Internet Speed Test</h3>
            <p className="text-xs text-slate-400 mt-0.5">Test actual download speed</p>
          </div>
          <Gauge className="h-5 w-5 text-cyan-300" />
        </div>

        {result ? (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg bg-slate-950/50 border border-slate-800/60 p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Download</p>
              <p className="text-xl font-bold text-cyan-300 mt-1">
                {result.downloadSpeed.toFixed(2)}
                <span className="text-xs text-slate-400 ml-1">Mbps</span>
              </p>
            </div>
            <div className="rounded-lg bg-slate-950/50 border border-slate-800/60 p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Latency</p>
              <p className="text-xl font-bold text-emerald-300 mt-1">
                {result.latencyMs}
                <span className="text-xs text-slate-400 ml-1">ms</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-950/50 border border-slate-800/60 p-3 mb-4 text-center">
            <Zap className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-500">No speed test yet</p>
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
              Testing...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Run Speed Test
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
