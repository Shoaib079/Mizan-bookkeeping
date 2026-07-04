"use client";

/**
 * Weekly day-by-day bar chart — last 7 days of sales vs expenses.
 * Data comes from the existing time-series daily points (client-side slice).
 * Always renders the card frame — loading, empty, error, or chart inside.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import { formatTry } from "@/lib/money";
import type { TimeSeriesDailyPoint } from "@/lib/report-types";

const CHART_HEIGHT = 280;

const COLORS = {
  sales: "#2563eb",
  expenses: "#dc2626",
} as const;

export type WeeklyChartStatus = "loading" | "loaded" | "error";

type Props = {
  status: WeeklyChartStatus;
  daily: TimeSeriesDailyPoint[];
};

type ChartRow = {
  label: string;
  sales: number;
  expenses: number;
};

function kurusToLira(kurus: number): number {
  return kurus / 100;
}

function tryLabel(value: number): string {
  return formatTry(Math.round(value * 100));
}

function formatWeekdayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const weekday = d.toLocaleDateString("tr-TR", { weekday: "short" });
  const day = d.getDate();
  return `${weekday} ${day}`;
}

export function WeeklyChart({ status, daily }: Props) {
  const last7 = daily.slice(-7);
  const data: ChartRow[] = last7.map((p) => ({
    label: formatWeekdayLabel(p.date),
    sales: kurusToLira(p.sales_kurus),
    expenses: kurusToLira(p.expenses_kurus),
  }));

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">Last 7 days</h2>

      {status === "loading" && (
        <Skeleton className="w-full rounded-md" style={{ height: CHART_HEIGHT }} />
      )}

      {status === "error" && (
        <p className="flex items-center text-sm text-muted-foreground" style={{ height: CHART_HEIGHT }}>
          Couldn&apos;t load trend data
        </p>
      )}

      {status === "loaded" && daily.length === 0 && (
        <p className="flex items-center text-sm text-muted-foreground" style={{ height: CHART_HEIGHT }}>
          No sales or expenses recorded for this period
        </p>
      )}

      {status === "loaded" && daily.length > 0 && (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={data} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => tryLabel(v)}
              width={90}
            />
            <Tooltip formatter={(v) => tryLabel(Number(v ?? 0))} />
            <Legend />
            <Bar
              dataKey="sales"
              name="Sales"
              fill={COLORS.sales}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="expenses"
              name="Expenses"
              fill={COLORS.expenses}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}
