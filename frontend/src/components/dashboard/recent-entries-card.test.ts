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
});
