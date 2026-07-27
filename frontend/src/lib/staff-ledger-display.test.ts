import { describe, expect, it } from "vitest";

import { staffDisplayRows } from "@/lib/staff-ledger-display";

function row(
  id: string,
  movement_type: string,
  amount_minor: number,
  journal_entry_id: string | null,
  description = "",
) {
  return {
    id,
    movement_date: "2026-07-27",
    movement_type,
    amount_minor,
    description,
    journal_entry_id,
  };
}

describe("staffDisplayRows", () => {
  it("collapses the apply-advance pair into one no-cash row", () => {
    const rows = [
      row("a", "salary_payment", -380_000, "je1", "Advance applied to salary"),
      row("b", "advance_applied", 380_000, "je1", "… — advance applied"),
    ];
    const display = staffDisplayRows(rows);

    expect(display).toHaveLength(1);
    expect(display[0].netMinor).toBe(0);
    expect(display[0].advanceAppliedMinor).toBe(380_000);
    expect(display[0].isAdvanceOffset).toBe(true);
    expect(display[0].balanceMinor).toBe(0);
  });

  it("shows a salary payment net of the advance it consumed", () => {
    // Paid 15.000 cash while 3.800 of advance was applied: payable cleared
    // 18.800, so the ledger rows are −18.800 and +3.800 → net −15.000 cash.
    const rows = [
      row("a", "salary_accrued", 2_880_000, "je0"),
      row("b", "salary_payment", -1_880_000, "je1"),
      row("c", "advance_applied", 380_000, "je1"),
    ];
    const display = staffDisplayRows(rows);

    expect(display).toHaveLength(2);
    expect(display[1].netMinor).toBe(-1_500_000);
    expect(display[1].advanceAppliedMinor).toBe(380_000);
    expect(display[1].isAdvanceOffset).toBe(false);
    expect(display[1].balanceMinor).toBe(1_380_000);
  });

  it("keeps unrelated rows separate and runs the balance in order", () => {
    const rows = [
      row("a", "salary_accrued", 100_000, "je1"),
      row("b", "salary_payment", -40_000, "je2"),
      row("c", "advance_paid", -25_000, "je3"),
    ];
    const display = staffDisplayRows(rows);

    expect(display.map((d) => d.balanceMinor)).toEqual([100_000, 60_000, 35_000]);
    expect(display.every((d) => d.memberCount === 1)).toBe(true);
  });

  it("excludes voided/superseded rows from the running balance", () => {
    const rows = [
      { ...row("a", "salary_accrued", 100_000, "je1") },
      { ...row("b", "salary_payment", -100_000, "je2"), display_kind: "void_reversal" },
      { ...row("c", "salary_payment", -40_000, "je3") },
    ];
    const display = staffDisplayRows(rows);

    expect(display[0].balanceMinor).toBe(100_000);
    expect(display[1].balanceMinor).toBeNull();
    expect(display[2].balanceMinor).toBe(60_000);
  });

  it("picks the non-companion row as primary for labels and actions", () => {
    const rows = [
      row("a", "advance_applied", 380_000, "je1"),
      row("b", "salary_payment", -380_000, "je1", "Advance applied to salary"),
    ];
    const display = staffDisplayRows(rows);

    expect(display[0].primary.id).toBe("b");
  });
});
