import { describe, expect, it } from "vitest";

import {
  fxStaffCount,
  sumTryStaffBalances,
  tryStaffIds,
} from "@/lib/staff-balance-total";

const employees = [
  { id: "try-a", pay_currency: "TRY" },
  { id: "usd-b", pay_currency: "USD" },
  { id: "try-c", pay_currency: "TRY" },
];

describe("tryStaffIds / fxStaffCount", () => {
  it("keeps only TRY employees for the hub total", () => {
    expect(tryStaffIds(employees)).toEqual(["try-a", "try-c"]);
    expect(fxStaffCount(employees)).toBe(1);
  });
});

describe("sumTryStaffBalances", () => {
  it("ignores FX minors even if present in the map", () => {
    const balances = new Map([
      ["try-a", 1_000_000],
      ["usd-b", 50_00], // $50.00 — must not be treated as ₺50
      ["try-c", -100_000],
    ]);
    expect(sumTryStaffBalances(employees, balances)).toBe(900_000);
  });

  it("skips omitted ledger rows (fetch failure)", () => {
    const balances = new Map([["try-a", 500_000]]);
    expect(sumTryStaffBalances(employees, balances)).toBe(500_000);
  });
});
