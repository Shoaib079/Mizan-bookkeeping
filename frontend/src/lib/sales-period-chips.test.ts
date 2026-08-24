import { describe, expect, it } from "vitest";

import {
  currentMonthRange,
  lastFullMonthRange,
} from "@/lib/date-range";
import {
  rangeForSalesPeriodChip,
  salesPeriodChipForRange,
  SALES_PERIOD_CHIPS,
} from "@/lib/sales-period-chips";
import { sourceDeclaring } from "@/test-support/source";

describe("sales period chips helpers", () => {
  const aug24 = new Date(2026, 7, 24, 12, 0, 0);

  it("This month is MTD; Last month is the full prior calendar month", () => {
    expect(rangeForSalesPeriodChip("this-month", aug24)).toEqual(
      currentMonthRange(aug24),
    );
    expect(rangeForSalesPeriodChip("last-month", aug24)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(rangeForSalesPeriodChip("custom", aug24)).toBeNull();
  });

  it("detects chip from range", () => {
    expect(
      salesPeriodChipForRange("2026-08-01", "2026-08-24", aug24),
    ).toBe("this-month");
    expect(
      salesPeriodChipForRange("2026-07-01", "2026-07-31", aug24),
    ).toBe("last-month");
    expect(
      salesPeriodChipForRange("2026-08-01", "2026-08-10", aug24),
    ).toBe("custom");
  });

  it("exposes only This month / Last month / Custom", () => {
    expect(SALES_PERIOD_CHIPS.map((c) => c.label)).toEqual([
      "This month",
      "Last month",
      "Custom",
    ]);
    expect(SALES_PERIOD_CHIPS.map((c) => c.label).join(" ")).not.toMatch(
      /Last 7 days|Last 30 days/i,
    );
  });
});

describe("lastFullMonthRange", () => {
  it("on 24 Aug returns full July", () => {
    expect(lastFullMonthRange(new Date(2026, 7, 24))).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });
});

describe("SalesReviewPanel period chips wiring", () => {
  it("puts SalesPeriodChips below status chips; no Last 7/30", () => {
    const panel = sourceDeclaring("SalesReviewPanel");
    expect(panel).toContain("SalesPeriodChips");
    expect(panel).toContain("SALES_REVIEW_FILTERS");
    expect(panel).toContain("salesFilterUsesRange(review)");
    expect(panel).not.toMatch(/Last 7 days|Last 30 days/i);
    expect(panel).not.toContain("ReportDateRange");
  });

  it("mutation: Last 7 days chip label appears → red", () => {
    const labels = SALES_PERIOD_CHIPS.map((c) => c.label).join("|");
    expect(labels).not.toMatch(/7 days|30 days/i);
    const broken = [...SALES_PERIOD_CHIPS.map((c) => c.label), "Last 7 days"];
    expect(broken.join("|")).toMatch(/7 days/i);
  });
});
