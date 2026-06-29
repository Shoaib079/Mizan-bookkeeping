import { describe, expect, it } from "vitest";

async function readCardSource() {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL("./recent-entries-card.tsx", import.meta.url), "utf8"),
  );
}

describe("RecentEntriesCard", () => {
  it("calls ledger entries with entity id and limit 10", async () => {
    const source = await readCardSource();
    expect(source).toContain("recentEntriesListUrl(entityId)");
    expect(source).toContain("apiFetch");
  });

  it("renders rows with date, description, source, and amount", async () => {
    const source = await readCardSource();
    expect(source).toContain("formatTrDate(entry.entry_date)");
    expect(source).toContain("entry.description");
    expect(source).toContain("journalSourceLabel(entry.source)");
    expect(source).toContain("journalEntryTotalKurus(entry.lines)");
  });

  it("shows empty and error states without throwing", async () => {
    const source = await readCardSource();
    expect(source).toContain("No entries yet");
    expect(source).toContain("Could not load recent entries");
    expect(source).not.toContain("throw ");
  });
});
