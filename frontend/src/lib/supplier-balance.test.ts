import { describe, expect, it } from "vitest";

import {
  computeSupplierAdvanceKurus,
  formatSupplierPayableBalance,
} from "@/lib/supplier-balance";

describe("supplier-balance", () => {
  it("formats negative balance as advance", () => {
    expect(formatSupplierPayableBalance(-200_000)).toContain("advance");
    expect(formatSupplierPayableBalance(-200_000)).toContain("2.000,00");
  });

  it("computes advance kuruş for pay-first", () => {
    expect(computeSupplierAdvanceKurus(0, 200_000)).toBe(200_000);
    expect(computeSupplierAdvanceKurus(100_000, 150_000)).toBe(50_000);
    expect(computeSupplierAdvanceKurus(200_000, 150_000)).toBe(0);
  });
});
