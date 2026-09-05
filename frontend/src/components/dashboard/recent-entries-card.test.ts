import { describe, expect, it } from "vitest";

import { sourceDeclaring, sourceDeclaringAll } from "@/test-support/source";

const source = () =>
  sourceDeclaringAll(
    "RecentEntriesCard",
    "RecentEntriesTable",
    "RecentEntriesMobileList",
  );

describe("RecentEntriesCard", () => {
  it("calls ledger entries with configurable list URL and query key", () => {
    const card = sourceDeclaring("RecentEntriesCard");
    expect(card).toContain("recentEntriesListUrl(entityId)");
    expect(card).toContain("listUrl");
    expect(card).toContain("queryKey");
    expect(card).toContain("apiFetch");
  });

  it("forks MobileCardList on phone and keeps the desktop table", () => {
    const card = sourceDeclaring("RecentEntriesCard");
    expect(card).toContain("useIsMobileShell");
    expect(card).toContain("RecentEntriesMobileList");
    expect(card).toContain("RecentEntriesTable");
    expect(sourceDeclaring("RecentEntriesMobileList")).toContain(
      "MobileCardList",
    );
    expect(sourceDeclaring("RecentEntriesTable")).toContain("table-fixed");
  });

  it("renders rows with date, description, source, and amount", () => {
    const src = source();
    expect(src).toContain("formatTrDate(entry.entry_date)");
    expect(src).toContain("entry.description");
    expect(src).toContain("journalSourceLabel(entry.source)");
    expect(src).toContain("journalEntryTotalKurus(entry.lines)");
  });

  it("supports custom title, empty message, and view-all link", () => {
    const card = sourceDeclaring("RecentEntriesCard");
    expect(card).toContain("{title}");
    expect(card).toContain("{emptyMessage}");
    expect(card).toContain("viewAllHref");
    expect(card).toContain('title = "Recent transactions"');
  });

  it("filters void-reversal rows and shows voided / corrected chrome", () => {
    const src = source();
    expect(sourceDeclaring("RecentEntriesCard")).toContain(
      "filterRecentEntriesForDisplay",
    );
    expect(src).toContain("StatusBadge");
    expect(src).toContain("EditedBadge");
    expect(sourceDeclaring("RecentEntriesTable")).toContain(
      "journalEntryRowClassName",
    );
  });

  it("aligns Date Type Description Amount Status columns on desktop", () => {
    const src = sourceDeclaring("RecentEntriesTable");
    expect(src).toContain("table-fixed");
    expect(src).toContain("<colgroup>");
    expect(src).toContain('className="w-auto"');
    expect(src).toMatch(
      /Date[\s\S]*Type[\s\S]*Description[\s\S]*Amount[\s\S]*Status/,
    );
    expect(src).toContain('data-testid="recent-entry-status"');
    expect(src).toContain('data-testid="recent-entry-amount"');
  });

  it("keeps Amount and Status right-aligned at the trailing edge", () => {
    const src = sourceDeclaring("RecentEntriesTable");
    expect(src).toMatch(/className="px-2 py-2 text-right"\s*>\s*Amount/);
    expect(src).toMatch(/className="px-2 py-2 text-right"\s*>\s*Status/);
    expect(src).toContain("text-right text-sm tabular-nums");
    expect(src).toContain(
      "whitespace-nowrap px-2 py-2.5 text-right text-xs text-muted-foreground",
    );
    expect(src).toContain("justify-end");
    const broken = src.replaceAll("text-right", "text-left");
    expect(broken).not.toContain(
      "whitespace-nowrap px-2 py-2.5 text-right text-xs text-muted-foreground",
    );
  });
});
