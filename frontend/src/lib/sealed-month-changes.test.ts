import { describe, expect, it } from "vitest";

import { changeKindLabel, changesSummary } from "@/lib/month-close";
import type { ChangedEntry, SealedMonthChangesRead } from "@/lib/report-types";

function entry(overrides: Partial<ChangedEntry> = {}): ChangedEntry {
  return {
    journal_entry_id: "je-1",
    entry_date: "2026-06-25",
    description: "Forgotten invoice",
    source: "manual",
    status: "posted",
    amount_kurus: 30_000,
    changed_at: "2026-08-02T10:00:00Z",
    change_kind: "posted",
    reverses_entry_id: null,
    ...overrides,
  };
}

function changes(
  entries: ChangedEntry[] = [],
): SealedMonthChangesRead {
  return {
    lock_id: "lock-1",
    period_start: "2026-06-01",
    period_end: "2026-06-30",
    closed_at: "2026-07-02T09:00:00Z",
    dirty: entries.length > 0,
    entries,
    reasons: [],
  };
}

describe("changeKindLabel", () => {
  it("says what happened in plain words", () => {
    expect(changeKindLabel("posted")).toBe("Added");
    expect(changeKindLabel("voided")).toBe("Removed");
    expect(changeKindLabel("reversal")).toBe("Reversal");
  });
});

describe("changesSummary", () => {
  it("says so when nothing has moved", () => {
    expect(changesSummary(changes())).toMatch(/No entries have changed/);
  });

  it("counts additions and removals separately", () => {
    // "3 changes" would hide whether an invoice was added or deleted, and
    // those are very different conversations.
    const text = changesSummary(
      changes([
        entry({ journal_entry_id: "a" }),
        entry({ journal_entry_id: "b" }),
        entry({ journal_entry_id: "c", change_kind: "voided" }),
      ]),
    );
    expect(text).toMatch(/2 entries added/);
    expect(text).toMatch(/1 removed/);
  });

  it("uses the singular for one addition", () => {
    expect(changesSummary(changes([entry()]))).toMatch(/1 entry added/);
  });

  it("does not count reversals as additions", () => {
    // A void produces both a "voided" original and a "reversal"; counting the
    // reversal as an addition would report every deletion as 1 added, 1 removed.
    const text = changesSummary(
      changes([
        entry({ journal_entry_id: "a", change_kind: "voided" }),
        entry({
          journal_entry_id: "b",
          change_kind: "reversal",
          reverses_entry_id: "a",
        }),
      ]),
    );
    expect(text).toMatch(/1 removed/);
    expect(text).not.toMatch(/added/);
  });
});
