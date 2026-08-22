import { describe, expect, it } from "vitest";

import {
  formatStaffHubAmount,
  fxStaffCount,
  isTryPayCurrency,
  staffHubNetSign,
  sumFxStaffBalancesByCurrency,
  sumTryStaffBalances,
  tryStaffIds,
} from "@/lib/staff-balance-total";

const employees = [
  { id: "try-a", pay_currency: "TRY" },
  { id: "usd-b", pay_currency: "USD" },
  { id: "try-c", pay_currency: "TRY" },
];

describe("isTryPayCurrency", () => {
  it("accepts common casings", () => {
    expect(isTryPayCurrency("TRY")).toBe(true);
    expect(isTryPayCurrency("try")).toBe(true);
    expect(isTryPayCurrency(" USD ")).toBe(false);
  });
});

describe("tryStaffIds / fxStaffCount", () => {
  it("keeps only TRY employees for the hub TRY total", () => {
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

  it("is zero when every employee is FX-paid (do not invent ₺)", () => {
    const onlyFx = [{ id: "usd-b", pay_currency: "USD" }];
    expect(sumTryStaffBalances(onlyFx, new Map([["usd-b", 50_00]]))).toBe(0);
    expect(fxStaffCount(onlyFx)).toBe(1);
  });
});

describe("sumFxStaffBalancesByCurrency + formatStaffHubAmount", () => {
  it("shows FX owed in native currency, not as ₺0", () => {
    const onlyFx = [
      { id: "usd-1", pay_currency: "USD" },
      { id: "eur-1", pay_currency: "EUR" },
    ];
    const balances = new Map([
      ["usd-1", 100_00],
      ["eur-1", 50_00],
    ]);
    const fx = sumFxStaffBalancesByCurrency(onlyFx, balances);
    expect(fx.get("USD")).toBe(100_00);
    expect(fx.get("EUR")).toBe(50_00);
    expect(
      formatStaffHubAmount(0, fx, (n) => `${n / 100} TRY`, (n, c) => `${n / 100} ${c}`),
    ).toBe("50 EUR · 100 USD");
  });

  it("combines TRY and FX on one card line", () => {
    const balances = new Map([
      ["try-a", 250_000],
      ["usd-b", 80_00],
    ]);
    const fx = sumFxStaffBalancesByCurrency(employees, balances);
    expect(
      formatStaffHubAmount(
        sumTryStaffBalances(employees, balances),
        fx,
        (n) => `${n / 100} TRY`,
        (n, c) => `${n / 100} ${c}`,
      ),
    ).toBe("2500 TRY · 80 USD");
  });
});

describe("staffHubNetSign", () => {
  it("returns the TRY total — FX is shown separately on the card", () => {
    expect(staffHubNetSign(-100_000)).toBe(-100_000);
    expect(staffHubNetSign(100_000)).toBe(100_000);
    expect(staffHubNetSign(0)).toBe(0);
  });
});
