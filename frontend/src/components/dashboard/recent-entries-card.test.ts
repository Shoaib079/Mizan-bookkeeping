import { describe, expect, it } from "vitest";

async function readCardSource() {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL("./recent-entries-card.tsx", import.meta.url), "utf8"),
  );
}

describe("RecentEntriesCard", () => {
  it("calls ledger entries with configurable list URL and query key", async () => {
    const source = await readCardSource();
    expect(source).toContain("recentEntriesListUrl(entityId)");
    expect(source).toContain("listUrl");
    expect(source).toContain("queryKey");
    expect(source).toContain("apiFetch");
  });

  it("renders rows with date, description, source, and amount", async () => {
    const source = await readCardSource();
    expect(source).toContain("formatTrDate(entry.entry_date)");
    expect(source).toContain("entry.description");
    expect(source).toContain("journalSourceLabel(entry.source)");
    expect(source).toContain("journalEntryTotalKurus(entry.lines)");
  });

  it("supports custom title, empty message, and view-all link", async () => {
    const source = await readCardSource();
    expect(source).toContain("{title}");
    expect(source).toContain("{emptyMessage}");
    expect(source).toContain("viewAllHref");
  });
});
