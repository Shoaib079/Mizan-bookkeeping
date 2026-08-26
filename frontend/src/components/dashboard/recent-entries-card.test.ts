import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const source = () => sourceDeclaring("RecentEntriesCard");

describe("RecentEntriesCard", () => {
  it("calls ledger entries with configurable list URL and query key", () => {
    expect(source()).toContain("recentEntriesListUrl(entityId)");
    expect(source()).toContain("listUrl");
    expect(source()).toContain("queryKey");
    expect(source()).toContain("apiFetch");
  });

  it("renders rows with date, description, source, and amount", () => {
    expect(source()).toContain("formatTrDate(entry.entry_date)");
    expect(source()).toContain("entry.description");
    expect(source()).toContain("journalSourceLabel(entry.source)");
    expect(source()).toContain("journalEntryTotalKurus(entry.lines)");
  });

  it("supports custom title, empty message, and view-all link", () => {
    expect(source()).toContain("{title}");
    expect(source()).toContain("{emptyMessage}");
    expect(source()).toContain("viewAllHref");
    expect(source()).toContain('title = "Recent transactions"');
  });

  it("filters void-reversal rows and shows voided / corrected chrome", () => {
    expect(source()).toContain("filterRecentEntriesForDisplay");
    expect(source()).toContain("StatusBadge");
    expect(source()).toContain("EditedBadge");
    expect(source()).toContain("journalEntryRowClassName");
  });

  it("aligns Date Type Description Amount Status columns", () => {
    const src = source();
    expect(src).toContain("table-fixed");
    expect(src).toContain("<colgroup>");
    expect(src).toContain('className="w-auto"');
    expect(src).toMatch(/Date[\s\S]*Type[\s\S]*Description[\s\S]*Amount[\s\S]*Status/);
    expect(src).toContain('data-testid="recent-entry-status"');
    expect(src).toContain('data-testid="recent-entry-amount"');
  });

  it("keeps Amount and Status right-aligned at the trailing edge", () => {
    const src = source();
    expect(src).toMatch(
      /className="px-2 py-2 text-right"\s*>\s*Amount/,
    );
    expect(src).toMatch(
      /className="px-2 py-2 text-right"\s*>\s*Status/,
    );
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
