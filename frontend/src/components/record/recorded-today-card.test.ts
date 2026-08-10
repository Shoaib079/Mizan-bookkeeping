import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("RecordedTodayCard", () => {
  it("filters to today and labels the section Recorded today", () => {
    const source = sourceDeclaring("RecordedTodayCard");
    expect(source).toContain('title="Recorded today"');
    expect(source).toContain("recordedTodayListUrl(entityId)");
    expect(source).toContain("recordedTodayLedgerHref()");
    expect(source).toContain("Nothing recorded yet today");
  });
});
