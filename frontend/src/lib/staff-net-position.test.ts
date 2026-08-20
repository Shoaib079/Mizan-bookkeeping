/** The staff card reads like every other subledger: one signed balance.
 *
 * These used to assert `netToPayMinor = max(0, owed − advance)`. The clamp is
 * gone because it deleted the direction — an employee holding the owner's
 * money read as 0,00 with the amount he owed appearing nowhere on the page.
 */

import { describe, expect, it } from "vitest";

import {
  netPositionCaption,
  netPositionReconciles,
  netsOutVisibly,
  staffBalanceHeading,
  staffNetPosition,
} from "@/lib/staff-net-position";

describe("staffNetPosition", () => {
  it("does not count the advance twice (BUGLOG 2026-07-29)", () => {
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

  it("shows what the employee owes instead of clamping it to zero", () => {
    // The whole point of the change. Under the old rule this was 0.
    const position = staffNetPosition({
      balance_minor: -273_000,
      remaining_accrual_minor: 0,
      outstanding_advance_minor: 273_000,
    });
    expect(position.balanceMinor).toBe(-273_000);
    expect(staffBalanceHeading(position)).toBe("Employee holds your money");
  });

  it("is positive when the business owes the employee", () => {
    const position = staffNetPosition({
      balance_minor: 300_000,
      remaining_accrual_minor: 500_000,
      outstanding_advance_minor: 200_000,
    });
    expect(position.balanceMinor).toBe(300_000);
    expect(staffBalanceHeading(position)).toBe("You owe employee");
    expect(netPositionReconciles(position)).toBe(true);
  });

  it("handles the Latif case — owed and advance cancelling exactly", () => {
    const position = staffNetPosition({
      balance_minor: 0,
      remaining_accrual_minor: 1_344_000,
      outstanding_advance_minor: 1_344_000,
    });
    expect(position.netMinor).toBe(0);
    expect(position.balanceMinor).toBe(0);
    expect(staffBalanceHeading(position)).toBe("Settled");
  });

  it("surfaces a residual rather than hiding it", () => {
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
      balanceMinor: 0,
      otherMinor: 0,
    });
  });
});

describe("the breakdown panel", () => {
  it("stays hidden when only one side stands", () => {
    // A TRY employee, after the backend settled the overlap. Explaining a
    // subtraction against zero is the line the owner asked to be rid of.
    expect(
      netsOutVisibly(
        staffNetPosition({
          balance_minor: 500_000,
          remaining_accrual_minor: 500_000,
          outstanding_advance_minor: 0,
        }),
      ),
    ).toBe(false);
  });

  it("appears when both genuinely stand", () => {
    // An FX employee: the automatic settlement is TRY-only, because an FX
    // advance carries its own lira rate. So the subtraction is real for them
    // and worth showing.
    expect(
      netsOutVisibly(
        staffNetPosition({
          balance_minor: 300_000,
          remaining_accrual_minor: 500_000,
          outstanding_advance_minor: 200_000,
        }),
      ),
    ).toBe(true);
  });
});

describe("netPositionCaption", () => {
  it("tells the reader which way to act", () => {
    expect(
      netPositionCaption(
        staffNetPosition({
          balance_minor: 400_000,
          remaining_accrual_minor: 500_000,
          outstanding_advance_minor: 100_000,
        }),
      ),
    ).toMatch(/Pay this to settle/);

    expect(
      netPositionCaption(
        staffNetPosition({
          balance_minor: -273_000,
          remaining_accrual_minor: 0,
          outstanding_advance_minor: 273_000,
        }),
      ),
    ).toMatch(/comes back to you/);

    expect(
      netPositionCaption(
        staffNetPosition({
          balance_minor: 0,
          remaining_accrual_minor: 0,
          outstanding_advance_minor: 0,
        }),
      ),
    ).toMatch(/Nothing owed either way/);
  });

  it("defers to the residual when the two figures don't explain the balance", () => {
    expect(
      netPositionCaption(
        staffNetPosition({
          balance_minor: 100_000,
          remaining_accrual_minor: 0,
          outstanding_advance_minor: 0,
        }),
      ),
    ).toMatch(/other movements/);
  });
});
