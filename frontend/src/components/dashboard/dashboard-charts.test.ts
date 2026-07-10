import { describe, it, expect } from "vitest";

describe("SalesMixChart", () => {
  it("exports SalesMixChart component", async () => {
    const mod = await import("./dashboard-charts");
    expect(typeof mod.SalesMixChart).toBe("function");
  });

  it("returns null when all sales are zero (source check)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./dashboard-charts.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("if (total === 0) return null");
  });

  it("filters out zero segments from donut data", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./dashboard-charts.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('.filter((d) => d.value > 0)');
  });
});

describe("SalesExpensesNetChart", () => {
  it("exports SalesExpensesNetChart component", async () => {
    const mod = await import("./dashboard-charts");
    expect(typeof mod.SalesExpensesNetChart).toBe("function");
  });

  it("returns null when all values are zero (source check)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./dashboard-charts.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain(
      "if (salesKurus === 0 && expensesKurus === 0 && netKurus === 0) return null",
    );
  });

  it("uses correct colors: sales=blue, expenses=red, net=green", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./dashboard-charts.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('sales: "#2563eb"');
    expect(source).toContain('expenses: "#dc2626"');
    expect(source).toContain('net: "#16a34a"');
  });
});

describe("OwedOwingChart removed", () => {
  it("does not export OwedOwingChart", async () => {
    const mod = await import("./dashboard-charts");
    expect((mod as Record<string, unknown>).OwedOwingChart).toBeUndefined();
  });

  it("source does not contain OwedOwingChart", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./dashboard-charts.tsx", import.meta.url), "utf8"),
    );
    expect(source).not.toContain("OwedOwingChart");
  });
});

describe("dashboard page wiring", () => {
  it("keeps the weekly chart and drops the mix/net composition charts", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("../../app/page.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("WeeklyChart");
    expect(source).not.toContain("SalesMixChart");
    expect(source).not.toContain("SalesExpensesNetChart");
    expect(source).not.toContain("OwedOwingChart");
  });

  it("gates the chart behind canReadFinancialReports", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("../../app/page.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("{canReadFinancialReports && (");
  });

  it("shows cash-in-hand and bank-balance KPIs, not needs-review", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("../../app/page.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("data.cash_in_hand_kurus");
    expect(source).toContain("data.bank_balance_kurus");
    expect(source).not.toContain("data.needs_review.total");
  });
});

describe("chart data conversion", () => {
  it("converts kuruş to lira via /100", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./dashboard-charts.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("return kurus / 100");
  });

  it("uses formatTry for tooltip labels", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./dashboard-charts.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('import { formatTry } from "@/lib/money"');
    expect(source).toContain("formatTry(Math.round(value * 100))");
  });
});
