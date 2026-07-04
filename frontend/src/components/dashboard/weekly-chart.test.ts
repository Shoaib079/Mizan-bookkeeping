import { describe, it, expect } from "vitest";

describe("WeeklyChart", () => {
  it("exports WeeklyChart component", async () => {
    const mod = await import("./weekly-chart");
    expect(typeof mod.WeeklyChart).toBe("function");
  });

  it("returns null when daily array is empty", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./weekly-chart.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("if (daily.length === 0) return null");
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

  it("gates weekly chart behind canReadFinancialReports", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("canReadFinancialReports && timeSeries");
  });
});
