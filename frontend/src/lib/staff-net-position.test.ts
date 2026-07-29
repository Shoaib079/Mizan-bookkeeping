import { describe, expect, it } from "vitest";

import {
  netPositionCaption,
  netPositionReconciles,
  staffNetPosition,
} from "@/lib/staff-net-position";

describe("staffNetPosition", () => {
  it("does not count the advance twice (BUGLOG 2026-07-29)", () => {
    // The reported case: everything accrued has been paid, and 2.730 of the
    // last payment was excess parked as an advance. The card showed −5.460
    // because it subtracted the advance from a balance that already included it.
    const position = staffNetPosition({
      balance_minor: -273_000,
      remaining_accrual_minor: 0,
      outstanding_advance_minor: 273_000,
    });

    expect(position.netMinor).toBe(-273_000);
    expect(position.salaryOwedMinor).toBe(0);
    expect(position.advanceHeldMinor).toBe(273_000);
    expect(netPositionReconciles(position)).toBe(true);
  });

  it("reads salary owed from the accrual, not from the balance", () => {
    // Owed 5.000, holding a 2.000 advance → net 3.000.
    const position = staffNetPosition({
      balance_minor: 300_000,
      remaining_accrual_minor: 500_000,
      outstanding_advance_minor: 200_000,
    });
    expect(position.salaryOwedMinor).toBe(500_000);
    expect(position.netMinor).toBe(300_000);
    expect(netPositionReconciles(position)).toBe(true);
  });

  it("handles the Latif case — owed and advance cancelling exactly", () => {
    // 13.440 of extra days owed against a 13.440 advance held: net zero, but
    // both components are large and must still be visible.
    const position = staffNetPosition({
      balance_minor: 0,
      remaining_accrual_minor: 1_344_000,
      outstanding_advance_minor: 1_344_000,
    });
    expect(position.netMinor).toBe(0);
    expect(position.salaryOwedMinor).toBe(1_344_000);
    expect(position.advanceHeldMinor).toBe(1_344_000);
    expect(netPositionReconciles(position)).toBe(true);
  });

  it("surfaces a residual rather than hiding it", () => {
    // Incentives, directly-paid extra days and opening balances move the
    // balance without being salary owed or advance held. Showing salary minus
    // advance as if it were the whole story would be a lie the card can't see.
    const position = staffNetPosition({
      balance_minor: 100_000,
      remaining_accrual_minor: 0,
      outstanding_advance_minor: 0,
    });
    expect(position.otherMinor).toBe(100_000);
    expect(netPositionReconciles(position)).toBe(false);
  });

  it("is all zeroes while the ledger is still loading", () => {
    expect(staffNetPosition(null)).toEqual({
      netMinor: 0,
      salaryOwedMinor: 0,
      advanceHeldMinor: 0,
      otherMinor: 0,
    });
  });
});

describe("netPositionCaption", () => {
  const at = (balance: number) =>
    netPositionCaption(
      staffNetPosition({
        balance_minor: balance,
        remaining_accrual_minor: 0,
        outstanding_advance_minor: 0,
      }),
    );

  it("names which way the money runs", () => {
    expect(at(300_000)).toMatch(/You owe/);
    expect(at(-273_000)).toMatch(/employee holds/);
    expect(at(0)).toMatch(/Settled/);
  });
});
