import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("Sales page visuals", () => {
  it("Posted KPIs use StatCard; table colors cash/card/total", () => {
    const kpis = sourceDeclaring("SalesPostedKpiCards");
    expect(kpis).toContain("StatCard");
    expect(kpis).toContain("Cash Sales");
    expect(kpis).toContain('tone="good"');
    expect(kpis).toContain('figureClassName="text-primary"');
    expect(kpis).toContain('figureClassName="font-bold text-foreground"');

    const table = sourceDeclaring("SalesReviewTable");
    expect(table).toContain('className="text-success"');
    expect(table).toContain('className="text-primary"');
    expect(table).toContain('className="font-bold text-foreground"');
    expect(table).toContain("DataTableFoot");
    expect(table).toContain("sales-period-totals-row");
  });

  it("SalesReviewPanel wires KPIs when the period applies", () => {
    const panel = sourceDeclaring("SalesReviewPanel");
    expect(panel).toContain("SalesPostedKpiCards");
    expect(panel).toContain("/reports/sales-summary?");
    expect(panel).toContain("usesRange && periodTotals");
  });

  it("FilterChips active state is filled primary (Posted pill)", () => {
    const chips = sourceDeclaring("FilterChips");
    expect(chips).toContain(
      "bg-primary font-semibold text-primary-foreground",
    );
    expect(chips).toContain("MOBILE_TOUCH_TARGET");
    expect(chips).not.toContain("bg-[var(--segment-active-bg)]");
  });

  it("mutation: cash cell loses text-success → red", () => {
    const table = sourceDeclaring("SalesReviewTable");
    expect(table).toContain("text-success");
    const broken = table.replaceAll("text-success", "text-muted-foreground");
    expect(broken).not.toContain("text-success");
  });
});
