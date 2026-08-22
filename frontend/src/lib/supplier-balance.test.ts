import { describe, expect, it } from "vitest";

import {
  computeSupplierAdvanceKurus,
  formatSupplierPayableBalance,
  supplierBalanceHeading,
  supplierDirectoryBalanceLabel,
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

  it("flips the owe label with the sign", () => {
    expect(supplierBalanceHeading(50_000)).toBe("You owe supplier");
    expect(supplierBalanceHeading(-50_000)).toBe("Supplier owes you");
    expect(supplierBalanceHeading(0)).toBe("Settled");
  });

  it("directory label keeps aggregate noun when net payable", () => {
    expect(supplierDirectoryBalanceLabel(50_000)).toBe("Total payables");
    expect(supplierDirectoryBalanceLabel(-50_000)).toBe("Supplier owes you");
    expect(supplierDirectoryBalanceLabel(0)).toBe("Settled");
  });
});
