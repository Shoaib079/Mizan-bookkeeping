import { describe, expect, it } from "vitest";

import {
  groupPartnerLedgerRows,
  partnerLedgerFilterMatches,
} from "@/lib/partner-ledger-view";

function row(
  movement_type: string,
  movement_date: string,
  journal_entry_id?: string,
) {
  return { movement_type, movement_date, journal_entry_id };
}

describe("partnerLedgerFilterMatches", () => {
  it("routes every movement type to exactly one chip", () => {
    expect(partnerLedgerFilterMatches("profit", "profit_allocation")).toBe(true);
    expect(partnerLedgerFilterMatches("profit", "profit_settlement")).toBe(true);
    expect(partnerLedgerFilterMatches("profit", "profit_paid")).toBe(true);
    expect(partnerLedgerFilterMatches("cash", "drawing")).toBe(true);
    expect(partnerLedgerFilterMatches("cash", "capital_contribution")).toBe(true);
    expect(partnerLedgerFilterMatches("expenses", "expense_fronted")).toBe(true);
    // No overlap between profit and cash — that's the whole point.
    expect(partnerLedgerFilterMatches("cash", "profit_allocation")).toBe(false);
    expect(partnerLedgerFilterMatches("profit", "drawing")).toBe(false);
  });

  it("all shows everything", () => {
    expect(partnerLedgerFilterMatches("all", "anything")).toBe(true);
  });
});

describe("groupPartnerLedgerRows", () => {
  it("keeps the settlement + capital pair of one allocation together", () => {
    const bands = groupPartnerLedgerRows([
      row("profit_settlement", "2026-06-30", "je-june"),
      row("profit_allocation", "2026-06-30", "je-june"),
      row("drawing", "2026-06-10", "je-draw"),
    ]);

    expect(bands).toHaveLength(2);
    expect(bands[0].rows).toHaveLength(2);
    expect(bands[0].title).toBe("June 2026 profit allocation");
    expect(bands[1].title).toBeNull();
    expect(bands[1].rows).toHaveLength(1);
  });

  it("gives each month's allocation its own band", () => {
    const bands = groupPartnerLedgerRows([
      row("profit_allocation", "2026-07-31", "je-july"),
      row("profit_allocation", "2026-06-30", "je-june"),
    ]);
    expect(bands).toHaveLength(2);
    expect(bands[0].title).toBe("July 2026 profit allocation");
    expect(bands[1].title).toBe("June 2026 profit allocation");
  });

  it("never drops a row", () => {
    const rows = [
      row("profit_allocation", "2026-07-31", "je-a"),
      row("drawing", "2026-07-10"),
      row("expense_fronted", "2026-07-02"),
      row("profit_allocation", "2026-06-30", "je-b"),
    ];
    const total = groupPartnerLedgerRows(rows).reduce(
      (n, band) => n + band.rows.length,
      0,
    );
    expect(total).toBe(rows.length);
  });

  it("returns nothing for an empty ledger", () => {
    expect(groupPartnerLedgerRows([])).toEqual([]);
  });
});
