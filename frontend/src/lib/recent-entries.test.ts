import { describe, expect, it } from "vitest";

import {
  journalEntryTotalKurus,
  journalSourceLabel,
  recentEntriesListUrl,
  RECENT_ENTRIES_LIMIT,
  type RecentEntryRow,
} from "@/lib/recent-entries";

describe("recentEntriesListUrl", () => {
  it("requests newest-first page with limit 10 for the entity", () => {
    expect(recentEntriesListUrl("ent-42")).toBe(
      `/entities/ent-42/ledger/entries?limit=${RECENT_ENTRIES_LIMIT}&offset=0`,
    );
  });
});

describe("journalEntryTotalKurus", () => {
  it("sums debit lines for display amount", () => {
    expect(
      journalEntryTotalKurus([
        { amount_kurus: 12_500, side: "debit" },
        { amount_kurus: 12_500, side: "credit" },
      ]),
    ).toBe(12_500);
  });
});

describe("recent entry row display", () => {
  const sample: RecentEntryRow = {
    id: "je-1",
    entry_date: "2026-05-01",
    description: "Manual rent",
    source: "expense_entry",
    lines: [
      { amount_kurus: 50_000, side: "debit" },
      { amount_kurus: 50_000, side: "credit" },
    ],
  };

  it("formats source label for the card subtitle", () => {
    expect(journalSourceLabel(sample.source)).toBe("expense entry");
  });

  it("derives row amount from mocked ledger lines", () => {
    expect(journalEntryTotalKurus(sample.lines)).toBe(50_000);
  });
});
