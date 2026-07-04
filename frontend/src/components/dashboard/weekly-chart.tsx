"use client";

/**
 * Weekly day-by-day bar chart — last 7 calendar days ending today.
 * Backend time-series only returns days with data; we zero-fill missing days
 * client-side so the axis always shows a full week.
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

export type ChartRow = {
  date: string;
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

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Last 7 calendar days ending on `endDate` (inclusive), oldest first. */
export function buildLast7CalendarDays(endDate: Date = new Date()): string[] {
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const days: string[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(end);
    d.setDate(end.getDate() - offset);
    days.push(toIsoDate(d));
  }
  return days;
}

export function formatWeekdayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const weekday = d.toLocaleDateString("tr-TR", { weekday: "short" });
  const day = d.getDate();
  return `${weekday} ${day}`;
}

/** Map sparse daily points onto a fixed 7-day calendar axis (zero-fill gaps). */
export function buildWeeklyChartData(
  daily: TimeSeriesDailyPoint[],
  endDate: Date = new Date(),
): ChartRow[] {
  const byDate = new Map(daily.map((p) => [p.date, p]));
  return buildLast7CalendarDays(endDate).map((date) => {
    const point = byDate.get(date);
    return {
      date,
      label: formatWeekdayLabel(date),
      sales: kurusToLira(point?.sales_kurus ?? 0),
      expenses: kurusToLira(point?.expenses_kurus ?? 0),
    };
  });
}

export function WeeklyChart({ status, daily }: Props) {
  const data = buildWeeklyChartData(daily);

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

      {status === "loaded" && (
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
