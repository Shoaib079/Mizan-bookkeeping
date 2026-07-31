import { describe, expect, it } from "vitest";

async function readCardSource() {
  return import("fs/promises").then((fs) =>
    fs.readFile(new URL("./recorded-today-card.tsx", import.meta.url), "utf8"),
  );
}

describe("RecordedTodayCard", () => {
  it("filters to today and labels the section Recorded today", async () => {
    const source = await readCardSource();
    expect(source).toContain('title="Recorded today"');
    expect(source).toContain("recordedTodayListUrl(entityId)");
    expect(source).toContain("recordedTodayLedgerHref()");
    expect(source).toContain("Nothing recorded yet today");
  });
});
