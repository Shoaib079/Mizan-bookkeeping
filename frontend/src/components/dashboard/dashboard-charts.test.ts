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
  it("imports SalesMixChart and SalesExpensesNetChart (not OwedOwingChart)", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("SalesMixChart");
    expect(source).toContain("SalesExpensesNetChart");
    expect(source).not.toContain("OwedOwingChart");
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

  it("uses 2-column grid for composition charts", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../app/page.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("lg:grid-cols-2");
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
