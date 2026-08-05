import { describe, expect, it } from "vitest";

import {
  comparableRates,
  formatRatePercent,
  impliedRatePercent,
  ratePeriodLabel,
  type CommissionRatePeriod,
} from "@/lib/commission-rate";

function period(overrides: Partial<CommissionRatePeriod> = {}): CommissionRatePeriod {
  return {
    year: 2026,
    month: 6,
    card_sales_kurus: 32_600_000,
    commission_kurus: 1_240_000,
    rate_percent: 3.8,
    ...overrides,
  };
}

describe("impliedRatePercent", () => {
  it("shows what an amount works out to", () => {
    // 12.400,00 ₺ against 326.000,00 ₺ of card sales.
    expect(impliedRatePercent(1_240_000, 32_600_000)).toBe(3.8);
  });

  it("makes a mistyped extra zero unmissable", () => {
    // This is the whole point: a threshold at 10% would have let 3,8% × 10
    // through only if it stayed under 10%. Showing 38% needs no threshold.
    expect(impliedRatePercent(12_400_000, 32_600_000)).toBe(38);
  });

  it("returns null with no card sales to divide by", () => {
    // Neither "0%" nor infinity is true — a period with no trading has no rate.
    expect(impliedRatePercent(1_240_000, 0)).toBeNull();
  });

  it("returns null before an amount is typed", () => {
    expect(impliedRatePercent(null, 32_600_000)).toBeNull();
    expect(impliedRatePercent(0, 32_600_000)).toBeNull();
  });

  it("rounds to one decimal", () => {
    expect(impliedRatePercent(123_456, 32_600_000)).toBe(0.4);
  });
});

describe("formatRatePercent", () => {
  it("uses a Turkish decimal comma", () => {
    expect(formatRatePercent(3.8)).toBe("3,8%");
    expect(formatRatePercent(38)).toBe("38,0%");
  });

  it("shows a dash rather than a misleading zero", () => {
    expect(formatRatePercent(null)).toBe("—");
  });
});

describe("ratePeriodLabel", () => {
  it("names the month in English but keeps the figure Turkish", () => {
    // The rate is a number and reads like one on a statement — 3,7% not 3.7%.
    // The month beside it is a label.
    expect(ratePeriodLabel(period({ month: 6, rate_percent: 3.7 }))).toBe(
      "June 3,7%",
    );
  });
});

describe("comparableRates", () => {
  it("keeps only periods with a real rate", () => {
    const result = comparableRates({
      periods: [
        period({ month: 6 }),
        // Sales but no commission recorded yet — 0,0% would read as a genuine
        // historic rate and drag the comparison down.
        period({ month: 5, commission_kurus: 0, rate_percent: 0 }),
        period({ month: 4, card_sales_kurus: 0, rate_percent: null }),
      ],
    });
    expect(result.map((p) => p.month)).toEqual([6]);
  });

  it("caps how many are shown", () => {
    const periods = [6, 5, 4, 3, 2, 1].map((month) => period({ month }));
    expect(comparableRates({ periods }, 4)).toHaveLength(4);
  });

  it("copes with no history at all", () => {
    expect(comparableRates(null)).toEqual([]);
    expect(comparableRates({ periods: [] })).toEqual([]);
  });
});
