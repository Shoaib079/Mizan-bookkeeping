import { describe, expect, it } from "vitest";

import {
  RECENT_ENTRIES_LIMIT,
  entryWasCorrected,
  filterRecentEntriesForDisplay,
  recentEntriesListUrl,
  type RecentEntryRow,
} from "@/lib/recent-entries";

function row(
  partial: Partial<RecentEntryRow> & Pick<RecentEntryRow, "id" | "entry_date">,
): RecentEntryRow {
  return {
    description: partial.description ?? "Entry",
    source: partial.source ?? "manual_expense",
    status: partial.status ?? "posted",
    reverses_entry_id: partial.reverses_entry_id ?? null,
    amends_entry_id: partial.amends_entry_id ?? null,
    amended_by_entry_id: partial.amended_by_entry_id ?? null,
    lines: partial.lines ?? [{ amount_kurus: 100_00, side: "debit" }],
    ...partial,
  };
}

describe("recentEntriesListUrl", () => {
  it("defaults to effective-only with limit 10 and no date filter", () => {
    const url = recentEntriesListUrl("ent-1");
    expect(url).toContain("effective_only=true");
    expect(url).toContain(`limit=${RECENT_ENTRIES_LIMIT}`);
    expect(url).not.toContain("from=");
    expect(url).not.toContain("to=");
  });

  it("Record desk requests effective-only with a fetch buffer above display cap", () => {
    const url = recentEntriesListUrl("ent-1", {
      limit: 25,
      effectiveOnly: true,
    });
    expect(url).toContain("effective_only=true");
    expect(url).toContain("limit=25");
  });

  it("supports optional date filters when callers need them", () => {
    const url = recentEntriesListUrl("ent-1", {
      from: "2026-07-31",
      to: "2026-07-31",
    });
    expect(url).toContain("from=2026-07-31");
    expect(url).toContain("to=2026-07-31");
  });
});

describe("filterRecentEntriesForDisplay", () => {
  it("drops voided and void-reversal rows and caps at 10", () => {
    const items = [
      row({ id: "1", entry_date: "2026-08-22" }),
      row({
        id: "voided",
        entry_date: "2026-08-22",
        status: "voided",
        description: "Voided expense",
      }),
      row({
        id: "rev",
        entry_date: "2026-08-22",
        reverses_entry_id: "voided",
        description: "Void: expense",
      }),
      row({ id: "2", entry_date: "2026-08-21" }),
      ...Array.from({ length: 12 }, (_, i) =>
        row({ id: `x${i}`, entry_date: "2026-08-01" }),
      ),
    ];
    const filtered = filterRecentEntriesForDisplay(items);
    expect(filtered.map((r) => r.id)).not.toContain("rev");
    expect(filtered.map((r) => r.id)).not.toContain("voided");
    expect(filtered).toHaveLength(10);
    expect(filtered[0]?.id).toBe("1");
  });
});

describe("entryWasCorrected", () => {
  it("detects correction linkage either direction", () => {
    expect(
      entryWasCorrected(row({ id: "a", entry_date: "2026-08-01", amends_entry_id: "b" })),
    ).toBe(true);
    expect(
      entryWasCorrected(
        row({ id: "b", entry_date: "2026-08-01", amended_by_entry_id: "a" }),
      ),
    ).toBe(true);
    expect(entryWasCorrected(row({ id: "c", entry_date: "2026-08-01" }))).toBe(
      false,
    );
  });
});
