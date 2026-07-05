"use client";

import { Card } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

interface MetricChartProps {
  title: string;
  data: Array<{ time: string; value: number }>;
  color: string;
  unit?: string;
  max?: number;
}

export function MetricChart({ title, data, color, unit = "%", max = 100 }: MetricChartProps) {
  // Slugify the title for use in the SVG gradient id. Spaces in SVG
  // fragment identifiers can cause `url(#...)` references to fail in
  // some browsers, making the area fill disappear. Also avoids
  // collisions when two charts share a title.
  const gradientId = `grad-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <Card className="border-slate-800/60 bg-slate-900/40 backdrop-blur-sm">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <span className="text-xs text-slate-400">
            {data.length > 0 ? `${data[data.length - 1].value.toFixed(1)}${unit}` : "—"}
          </span>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0.008 240)" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: "oklch(0.65 0.01 240)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "oklch(0.65 0.01 240)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                domain={[0, max]}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.12 0.006 240)",
                  border: "1px solid oklch(0.22 0.008 240)",
                  borderRadius: 8,
                  color: "oklch(0.97 0.003 240)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "oklch(0.65 0.01 240)" }}
                formatter={(v: number) => [`${v.toFixed(1)}${unit}`, title]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
