"use client";

import { formatMoneyPounds } from "@/lib/formatMoney";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export function MvChart({
  data,
  className = "",
}: {
  data: { season: string; mv: number }[];
  /** Extra classes on the chart area (use h-full when parent sets height). */
  className?: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        No history yet — values log after matches and season ticks.
      </p>
    );
  }

  return (
    <div
      className={`flex h-44 w-full flex-col sm:h-48 xl:h-full xl:min-h-0 xl:flex-1 ${className}`.trim()}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="season"
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={{ stroke: "#cbd5e1" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            axisLine={{ stroke: "#cbd5e1" }}
            tickFormatter={(v) => `£${(v / 1e6).toFixed(1)}M`}
          />
          <Tooltip
            formatter={(v) => [
              typeof v === "number" ? formatMoneyPounds(v) : String(v),
              "Value",
            ]}
            labelFormatter={(l) => `Season ${l}`}
            contentStyle={{
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              fontSize: "12px",
              boxShadow: "0 4px 12px rgba(15,23,42,0.08)",
            }}
          />
          <Line
            type="monotone"
            dataKey="mv"
            stroke="#047857"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#047857", strokeWidth: 2, stroke: "#fff" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
