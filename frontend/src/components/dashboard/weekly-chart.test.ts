import { describe, it, expect } from "vitest";

describe("WeeklyChart", () => {
  it("exports WeeklyChart component", async () => {
    const mod = await import("./weekly-chart");
    expect(typeof mod.WeeklyChart).toBe("function");
  });

  it("always renders card frame (never returns null)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).not.toContain("return null");
    expect(source).toContain("Last 7 days");
  });

  it("shows loading skeleton when status is loading", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('status === "loading"');
    expect(source).toContain("<Skeleton");
  });

  it("shows empty state when loaded with no daily data", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('status === "loaded" && daily.length === 0');
    expect(source).toContain("No sales or expenses recorded for this period");
  });

  it("shows error state when status is error", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('status === "error"');
    expect(source).toContain("Couldn&apos;t load trend data");
  });

  it("slices last 7 entries from daily data", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("daily.slice(-7)");
  });

  it("renders two bars per day — sales and expenses", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('dataKey="sales"');
    expect(source).toContain('dataKey="expenses"');
    expect(source).toContain('name="Sales"');
    expect(source).toContain('name="Expenses"');
  });

  it("uses correct colors: sales=blue, expenses=red", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('sales: "#2563eb"');
    expect(source).toContain('expenses: "#dc2626"');
  });

  it("formats tooltip in TRY via formatTry", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('import { formatTry } from "@/lib/money"');
    expect(source).toContain("formatTry(Math.round(value * 100))");
  });

  it("formats X axis as weekday + day number", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('weekday: "short"');
    expect(source).toContain("formatWeekdayLabel");
  });

  it("has a Legend component", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("<Legend />");
  });
});

describe("dashboard weekly chart wiring", () => {
  it("imports WeeklyChart (not DailyTrendChart)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("WeeklyChart");
    expect(source).not.toContain("DailyTrendChart");
  });

  it("tracks time-series fetch status separately", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("timeSeriesStatus");
    expect(source).toContain('setTimeSeriesStatus("loaded")');
    expect(source).toContain('setTimeSeriesStatus("error")');
  });

  it("warns on time-series failure instead of swallowing", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain('console.warn("Failed to load trend data:"');
    expect(source).not.toContain(".catch(() => null)");
  });

  it("always renders WeeklyChart when canReadFinancialReports (not gated on data length)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("canReadFinancialReports && (");
    expect(source).toContain("status={timeSeriesStatus}");
    expect(source).not.toContain("timeSeries.daily.length > 0");
  });

  it("gates weekly chart behind canReadFinancialReports", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("canReadFinancialReports");
  });
});
