/** Guards for staff pay helpers — net-to-pay + strict extra days. */

import { describe, expect, it } from "vitest";

import { sourceDeclaringAll } from "@/test-support/source";

import {
  formatCashPrefill,
  netToPayMinor,
  parseStrictExtraDays,
} from "@/lib/staff-salary";

describe("netToPayMinor", () => {
  it("is owed minus advance, never negative", () => {
    expect(netToPayMinor(500_000, 100_000)).toBe(400_000);
    expect(netToPayMinor(100_000, 500_000)).toBe(0);
    expect(netToPayMinor(0, 0)).toBe(0);
  });
});

describe("parseStrictExtraDays", () => {
  it("accepts whole days 1–31", () => {
    expect(parseStrictExtraDays("3")).toBe(3);
    expect(parseStrictExtraDays("31")).toBe(31);
  });

  it("rejects fractions and junk", () => {
    expect(parseStrictExtraDays("1.5")).toBeNull();
    expect(parseStrictExtraDays("2abc")).toBeNull();
    expect(parseStrictExtraDays("0")).toBeNull();
    expect(parseStrictExtraDays("")).toBeNull();
  });
});

describe("formatCashPrefill", () => {
  it("formats TRY with Turkish grouping", () => {
    expect(formatCashPrefill(400_000, true)).toBe("4.000,00");
    expect(formatCashPrefill(0, true)).toBe("");
  });
});

describe("staff salary dialog — single payment POST", () => {
  it("posts salary + extra days in one payment call", () => {
    const src = sourceDeclaringAll(
      "StaffSalaryPaymentDialog",
      "postStaffSalaryPayment",
    );
    expect(src).toContain("/payments");
    expect(src).toContain("extra_days");
    expect(src).toContain("per_day_minor");
    // Old two-step path must not return.
    expect(src).not.toContain("/extra-days");
    expect(src).not.toContain("postExtraDaysAccrual");
  });
});
