import { describe, it, expect } from "vitest";

describe("DailyTrendChart (DASH-B)", () => {
  it("exports DailyTrendChart component", async () => {
    const mod = await import("./daily-trend-chart");
    expect(typeof mod.DailyTrendChart).toBe("function");
  });

  it("returns null when daily array is empty", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./daily-trend-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("if (daily.length === 0) return null");
  });

  it("renders sales, expenses, and net lines", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./daily-trend-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('dataKey="sales"');
    expect(source).toContain('dataKey="expenses"');
    expect(source).toContain('dataKey="net"');
    expect(source).toContain('name="Sales"');
    expect(source).toContain('name="Expenses"');
    expect(source).toContain('name="Net"');
  });

  it("uses correct colors: sales=blue, expenses=red, net=green", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./daily-trend-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('sales: "#2563eb"');
    expect(source).toContain('expenses: "#dc2626"');
    expect(source).toContain('net: "#16a34a"');
  });

  it("formats tooltip in TRY via formatTry", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./daily-trend-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('import { formatTry } from "@/lib/money"');
    expect(source).toContain("formatTry(Math.round(value * 100))");
  });

  it("hides dots when range exceeds 31 days", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./daily-trend-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("dot={daily.length <= 31}");
  });
});

describe("dashboard time-series wiring (DASH-B)", () => {
  it("imports DailyTrendChart and TimeSeriesRead", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("DailyTrendChart");
    expect(source).toContain("TimeSeriesRead");
  });

  it("fetches time-series endpoint in parallel with dashboard", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("reports/time-series");
    expect(source).toContain("Promise.all");
  });

  it("gates trend chart behind canReadFinancialReports", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("canReadFinancialReports && timeSeries");
  });
});

describe("TimeSeriesRead type", () => {
  it("includes daily, expenses_by_account, and expenses_by_item", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../lib/report-types.ts", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("TimeSeriesRead");
    expect(source).toContain("TimeSeriesDailyPoint");
    expect(source).toContain("expenses_by_account");
    expect(source).toContain("expenses_by_item");
  });
});
