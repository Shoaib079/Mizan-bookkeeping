import { describe, expect, it } from "vitest";

import { recentEntriesListUrl } from "@/lib/recent-entries";

describe("recentEntriesListUrl", () => {
  it("requests effective-only journal rows for dashboard", () => {
    expect(recentEntriesListUrl("ent-1")).toContain("effective_only=true");
  });
});
