import { describe, it, expect } from "vitest";

import {
  WeeklyChart,
  buildLast7CalendarDays,
  buildWeeklyChartData,
  formatWeekdayLabel,
} from "./weekly-chart";
import type { TimeSeriesDailyPoint } from "@/lib/report-types";
import { sourceDeclaring } from "@/test-support/source";

describe("WeeklyChart", () => {
  it("exports WeeklyChart component", () => {
    expect(typeof WeeklyChart).toBe("function");
  });

  it("always renders card frame (never returns null)", () => {
    const source = sourceDeclaring("WeeklyChart");
    expect(source).not.toContain("return null");
    expect(source).toContain("Last 7 days");
    expect(source).toContain("weekly-chart-period-caption");
    expect(source).toContain("This month");
  });

  it("shows loading skeleton when status is loading", () => {
    const source = sourceDeclaring("WeeklyChart");
    expect(source).toContain('status === "loading"');
    expect(source).toContain("<Skeleton");
  });

  it("does not show a separate empty-state message when loaded", () => {
    const source = sourceDeclaring("WeeklyChart");
    expect(source).not.toContain("No sales or expenses recorded for this period");
    expect(source).toContain('status === "loaded"');
  });

  it("shows error state when status is error", () => {
    const source = sourceDeclaring("WeeklyChart");
    expect(source).toContain('status === "error"');
    expect(source).toContain("Couldn&apos;t load trend data");
  });

  it("renders two bars per day — sales and expenses", () => {
    const source = sourceDeclaring("WeeklyChart");
    expect(source).toContain('dataKey="sales"');
    expect(source).toContain('dataKey="expenses"');
    expect(source).toContain('name="Sales"');
    expect(source).toContain('name="Expenses"');
  });

  it("uses theme tokens for sales and expenses", () => {
    const source = sourceDeclaring("WeeklyChart");
    expect(source).toContain("chartSeriesColors.sales");
    expect(source).toContain("chartSeriesColors.expenses");
  });

  it("formats tooltip in TRY via formatTry", () => {
    const source = sourceDeclaring("WeeklyChart");
    expect(source).toContain('import { formatTry } from "@/lib/money"');
    expect(source).toContain("formatTry(Math.round(value * 100))");
  });

  it("formats X axis as weekday + day number", () => {
    const source = sourceDeclaring("WeeklyChart");
    expect(source).toContain('toLocaleDateString("en-US"');
    expect(source).toContain('weekday: "short"');
    expect(source).toContain("formatWeekdayLabel");
  });

  it("has a Legend component", () => {
    const source = sourceDeclaring("WeeklyChart");
    expect(source).toContain("<Legend wrapperStyle={chartLegendStyle} />");
  });
});

describe("buildLast7CalendarDays", () => {
  it("returns exactly 7 ISO dates ending on the given day", () => {
    const end = new Date(2026, 6, 4); // 4 Jul 2026 local
    expect(buildLast7CalendarDays(end)).toEqual([
      "2026-06-28",
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
    ]);
  });
});

describe("buildWeeklyChartData", () => {
  const end = new Date(2026, 6, 4);

  it("always produces 7 slots for an empty week", () => {
    const rows = buildWeeklyChartData([], end);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.sales === 0 && r.expenses === 0)).toBe(true);
    expect(rows.map((r) => r.date)).toEqual(buildLast7CalendarDays(end));
    expect(rows.every((r) => r.label.length > 0)).toBe(true);
  });

  it("maps a day with data onto the matching slot", () => {
    const daily: TimeSeriesDailyPoint[] = [
      {
        date: "2026-07-02",
        sales_kurus: 50_000,
        expenses_kurus: 12_500,
        net_kurus: 37_500,
      },
    ];
    const rows = buildWeeklyChartData(daily, end);
    const slot = rows.find((r) => r.date === "2026-07-02");
    expect(slot).toEqual({
      date: "2026-07-02",
      label: formatWeekdayLabel("2026-07-02"),
      sales: 500,
      expenses: 125,
    });
    const quiet = rows.filter((r) => r.date !== "2026-07-02");
    expect(quiet.every((r) => r.sales === 0 && r.expenses === 0)).toBe(true);
  });
});

describe("dashboard weekly chart wiring", () => {
  it("imports WeeklyChart (not DailyTrendChart)", () => {
    const source = sourceDeclaring("HomePage");
    expect(source).toContain("WeeklyChart");
    expect(source).not.toContain("DailyTrendChart");
  });

  it("tracks time-series fetch status separately", () => {
    const source = sourceDeclaring("HomePage");
    expect(source).toContain("timeSeriesStatus");
    expect(source).toContain('setTimeSeriesStatus("loaded")');
    expect(source).toContain('setTimeSeriesStatus("error")');
  });

  it("warns on time-series failure instead of swallowing", () => {
    const source = sourceDeclaring("HomePage");
    expect(source).toContain('console.warn("Failed to load trend data:"');
    expect(source).not.toContain(".catch(() => null)");
  });

  it("always renders WeeklyChart when canReadFinancialReports (not gated on data length)", () => {
    const source = sourceDeclaring("HomePage");
    expect(source).toContain("canReadFinancialReports && (");
    expect(source).toContain("status={timeSeriesStatus}");
    expect(source).not.toContain("timeSeries.daily.length > 0");
  });

  it("gates weekly chart behind canReadFinancialReports", () => {
    const source = sourceDeclaring("HomePage");
    expect(source).toContain("canReadFinancialReports");
  });
});
