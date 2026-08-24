import { describe, expect, it } from "vitest";

import {
  currentMonthRange,
  lastFullMonthRange,
} from "@/lib/date-range";
import {
  rangeForSalesSummaryChip,
  salesSummaryColumnCaption,
} from "@/lib/sales-summary-range";

describe("lastFullMonthRange", () => {
  it("on 24 Aug returns full July", () => {
    const aug24 = new Date(2026, 7, 24, 12, 0, 0);
    expect(lastFullMonthRange(aug24)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });
});

describe("rangeForSalesSummaryChip", () => {
  const aug24 = new Date(2026, 7, 24, 12, 0, 0);

  it("This month is MTD", () => {
    expect(rangeForSalesSummaryChip("this-month", aug24)).toEqual(
      currentMonthRange(aug24),
    );
    expect(rangeForSalesSummaryChip("this-month", aug24)).toEqual({
      from: "2026-08-01",
      to: "2026-08-24",
    });
  });

  it("Last month is the full prior calendar month", () => {
    expect(rangeForSalesSummaryChip("last-month", aug24)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("Custom does not invent a range", () => {
    expect(rangeForSalesSummaryChip("custom", aug24)).toBeNull();
  });
});

describe("salesSummaryColumnCaption", () => {
  it("formats span; marks full month", () => {
    expect(
      salesSummaryColumnCaption("2026-08-01", "2026-08-24", false),
    ).toBe("01.08.2026 – 24.08.2026");
    expect(
      salesSummaryColumnCaption("2026-07-01", "2026-07-31", true),
    ).toBe("01.07.2026 – 31.07.2026 · full month");
  });
});
