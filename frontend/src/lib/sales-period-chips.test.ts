import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("SalesReviewPanel period control", () => {
  it("uses ReportDateRange when range applies — no This month / Last month chips", () => {
    const panel = sourceDeclaring("SalesReviewPanel");
    expect(panel).toContain("ReportDateRange");
    expect(panel).toContain("SALES_REVIEW_FILTERS");
    expect(panel).toContain("salesFilterUsesRange(review)");
    expect(panel).toContain("usesRange &&");
    expect(panel).not.toContain("SalesPeriodChips");
    expect(panel).not.toMatch(/This month|Last month/i);
    expect(panel).not.toMatch(/Last 7 days|Last 30 days/i);
  });

  it("mutation: SalesPeriodChips return → red", () => {
    const panel = sourceDeclaring("SalesReviewPanel");
    expect(panel).not.toContain("SalesPeriodChips");
    const broken = panel.replace(
      "<ReportDateRange",
      "<SalesPeriodChips",
    );
    expect(broken).toContain("SalesPeriodChips");
  });
});
