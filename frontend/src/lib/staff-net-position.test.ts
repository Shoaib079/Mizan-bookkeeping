import { describe, expect, it } from "vitest";

import {
  netPositionCaption,
  netPositionReconciles,
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
    expect(position.netToPayMinor).toBe(0);
    expect(netPositionReconciles(position)).toBe(true);
  });

  it("net to pay is owed minus advance", () => {
    const position = staffNetPosition({
      balance_minor: 300_000,
      remaining_accrual_minor: 500_000,
      outstanding_advance_minor: 200_000,
    });
    expect(position.salaryOwedMinor).toBe(500_000);
    expect(position.netToPayMinor).toBe(300_000);
    expect(position.netMinor).toBe(300_000);
    expect(netPositionReconciles(position)).toBe(true);
  });

  it("handles the Latif case — owed and advance cancelling exactly", () => {
    const position = staffNetPosition({
      balance_minor: 0,
      remaining_accrual_minor: 1_344_000,
      outstanding_advance_minor: 1_344_000,
    });
    expect(position.netMinor).toBe(0);
    expect(position.netToPayMinor).toBe(0);
    expect(position.salaryOwedMinor).toBe(1_344_000);
    expect(position.advanceHeldMinor).toBe(1_344_000);
    expect(netPositionReconciles(position)).toBe(true);
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
      netToPayMinor: 0,
      otherMinor: 0,
    });
  });
});

describe("netPositionCaption", () => {
  it("names settlement from net-to-pay and advance", () => {
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
    ).toMatch(/holds this advance/);

    expect(
      netPositionCaption(
        staffNetPosition({
          balance_minor: 0,
          remaining_accrual_minor: 0,
          outstanding_advance_minor: 0,
        }),
      ),
    ).toMatch(/Settled/);
  });
});
