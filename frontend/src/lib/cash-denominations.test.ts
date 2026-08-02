import { describe, expect, it } from "vitest";

import {
  denominationLinesFromQuantities,
  denominationTotalKurus,
  emptyDenominationQuantities,
} from "@/lib/cash-denominations";

describe("cash denominations", () => {
  it("totals note counts in kuruş", () => {
    const qty = emptyDenominationQuantities();
    qty[20_000] = 50; // 50 × 200 ₺
    qty[10_000] = 10; // 10 × 100 ₺
    qty[5_000] = 5; // 5 × 50 ₺
    const lines = denominationLinesFromQuantities(qty);
    expect(denominationTotalKurus(lines)).toBe(
      50 * 20_000 + 10 * 10_000 + 5 * 5_000,
    );
    expect(lines).toHaveLength(3);
  });

  it("drops zero quantities", () => {
    const qty = emptyDenominationQuantities();
    qty[100] = 0;
    qty[500] = 2;
    expect(denominationLinesFromQuantities(qty)).toEqual([
      { denomination_kurus: 500, quantity: 2 },
    ]);
  });
});
