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

describe("OwedOwingChart", () => {
  it("exports OwedOwingChart component", async () => {
    const mod = await import("./dashboard-charts");
    expect(typeof mod.OwedOwingChart).toBe("function");
  });

  it("returns null when all values are zero (source check)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./dashboard-charts.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain(
      "if (payablesKurus === 0 && receivablesKurus === 0 && tryPositionKurus === 0)",
    );
  });
});

describe("dashboard page wiring (DASH-A)", () => {
  it("imports all three chart components", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("SalesMixChart");
    expect(source).toContain("SalesExpensesNetChart");
    expect(source).toContain("OwedOwingChart");
  });

  it("gates charts behind canReadFinancialReports", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("{canReadFinancialReports && (");
  });

  it("passes DashboardRead sales fields to SalesMixChart", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("cashKurus={data.sales.cash_sales_kurus}");
    expect(source).toContain("posCardKurus={data.sales.pos_card_sales_kurus}");
    expect(source).toContain("deliveryKurus={data.sales.delivery_sales_kurus}");
    expect(source).toContain("otherKurus={data.sales.other_sales_kurus}");
  });

  it("passes totals to SalesExpensesNetChart", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("salesKurus={data.sales.total_sales_kurus}");
    expect(source).toContain("expensesKurus={data.total_expenses_kurus}");
    expect(source).toContain("netKurus={data.net_result_kurus}");
  });

  it("passes balance fields to OwedOwingChart", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("payablesKurus={data.total_payables_kurus}");
    expect(source).toContain("receivablesKurus={data.total_receivables_kurus}");
    expect(source).toContain("tryPositionKurus={data.total_try_position_kurus}");
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
