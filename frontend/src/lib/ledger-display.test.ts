import { describe, expect, it } from "vitest";

import {
  canCorrectSubledgerRow,
  canEditSubledgerRow,
  countHiddenLedgerHistory,
  filterLedgerRows,
  subledgerRowClassName,
} from "@/lib/ledger-display";

describe("ledger-display", () => {
  const rows = [
    { id: "1", display_kind: "effective" as const, journal_entry_id: "je-1" },
    { id: "2", display_kind: "void_reversal" as const, journal_entry_id: "je-2" },
    { id: "3", display_kind: "superseded" as const, journal_entry_id: "je-3" },
    { id: "4", display_kind: "effective" as const, was_corrected: true },
  ];

  it("filters to effective rows by default", () => {
    expect(filterLedgerRows(rows, false).map((row) => row.id)).toEqual(["1", "4"]);
  });

  it("shows all rows when history is on", () => {
    expect(filterLedgerRows(rows, true)).toHaveLength(4);
  });

  it("counts hidden history rows", () => {
    expect(countHiddenLedgerHistory(rows)).toBe(2);
  });

  it("styles non-effective history rows", () => {
    expect(subledgerRowClassName("void_reversal", true)).toContain("line-through");
    expect(subledgerRowClassName("void_reversal", false)).toContain("line-through");
    expect(subledgerRowClassName("effective", true)).toBe("");
  });

  it("allows edit only on effective rows with journal id", () => {
    expect(canEditSubledgerRow(rows[0])).toBe(true);
    expect(canEditSubledgerRow(rows[1])).toBe(false);
    expect(canEditSubledgerRow(rows[3])).toBe(false);
  });
});
