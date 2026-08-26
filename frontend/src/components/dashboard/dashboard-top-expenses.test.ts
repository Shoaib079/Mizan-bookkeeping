import { describe, expect, it } from "vitest";

import { expenseBarPercent } from "@/components/dashboard/dashboard-top-expenses";
import { sourceDeclaring } from "@/test-support/source";

describe("expenseBarPercent", () => {
  it("scales each row against the largest amount", () => {
    expect(expenseBarPercent(50_000_00, 100_000_00)).toBe(50);
    expect(expenseBarPercent(100_000_00, 100_000_00)).toBe(100);
    expect(expenseBarPercent(0, 100_000_00)).toBe(0);
    expect(expenseBarPercent(10, 0)).toBe(0);
  });
});

describe("DashboardTopExpenses layout", () => {
  it("renders one bar list, not StatCards", () => {
    const src = sourceDeclaring("DashboardTopExpenses");
    expect(src).toContain("dashboard-top-expense-bar");
    expect(src).toContain("expenseBarPercent");
    expect(src).not.toContain("StatCard");
  });
});

describe("BalancesOverview compact layout", () => {
  it("uses an inline strip, not StatCards", () => {
    const src = sourceDeclaring("BalancesOverview");
    expect(src).toContain("balances-overview-compact");
    expect(src).toContain("CompactBalanceStrip");
    expect(src).not.toContain("StatCard");
  });
});
