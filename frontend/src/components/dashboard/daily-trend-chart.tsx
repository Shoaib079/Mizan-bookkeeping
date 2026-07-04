"use client";

/**
 * Daily trend line chart — sales, expenses, net over the selected date range (DASH-B).
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

import { formatTry } from "@/lib/money";
import type { TimeSeriesDailyPoint } from "@/lib/report-types";

const CHART_HEIGHT = 280;

const COLORS = {
  sales: "#2563eb",
  expenses: "#dc2626",
  net: "#16a34a",
} as const;

type Props = {
  daily: TimeSeriesDailyPoint[];
};

type ChartRow = {
  label: string;
  sales: number;
  expenses: number;
  net: number;
};

function kurusToLira(kurus: number): number {
  return kurus / 100;
}

function tryLabel(value: number): string {
  return formatTry(Math.round(value * 100));
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

export function DailyTrendChart({ daily }: Props) {
  if (daily.length === 0) return null;

  const data: ChartRow[] = daily.map((p) => ({
    label: formatDateLabel(p.date),
    sales: kurusToLira(p.sales_kurus),
    expenses: kurusToLira(p.expenses_kurus),
    net: kurusToLira(p.net_kurus),
  }));

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Daily trend</h2>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => tryLabel(v)}
            width={90}
          />
          <Tooltip formatter={(v: number) => tryLabel(v)} />
          <Legend />
          <Line
            type="monotone"
            dataKey="sales"
            name="Sales"
            stroke={COLORS.sales}
            strokeWidth={2}
            dot={daily.length <= 31}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            name="Expenses"
            stroke={COLORS.expenses}
            strokeWidth={2}
            dot={daily.length <= 31}
          />
          <Line
            type="monotone"
            dataKey="net"
            name="Net"
            stroke={COLORS.net}
            strokeWidth={2}
            dot={daily.length <= 31}
            strokeDasharray="5 3"
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
