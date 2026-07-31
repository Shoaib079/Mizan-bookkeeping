import { describe, expect, it } from "vitest";

import {
  recordedTodayLedgerHref,
  recordedTodayListUrl,
  recentEntriesListUrl,
  todayIsoDate,
} from "@/lib/recent-entries";

describe("recentEntriesListUrl", () => {
  it("requests effective-only journal rows", () => {
    expect(recentEntriesListUrl("ent-1")).toContain("effective_only=true");
  });

  it("supports optional date filters", () => {
    const url = recentEntriesListUrl("ent-1", {
      from: "2026-07-31",
      to: "2026-07-31",
    });
    expect(url).toContain("from=2026-07-31");
    expect(url).toContain("to=2026-07-31");
  });
});

describe("recorded today helpers", () => {
  it("filters ledger list and report links to one calendar day", () => {
    const ref = new Date(2026, 6, 31);
    expect(todayIsoDate(ref)).toBe("2026-07-31");
    expect(recordedTodayListUrl("ent-1", ref)).toContain("from=2026-07-31");
    expect(recordedTodayListUrl("ent-1", ref)).toContain("to=2026-07-31");
    expect(recordedTodayLedgerHref(ref)).toBe(
      "/reports/ledger?from=2026-07-31&to=2026-07-31",
    );
  });
});
