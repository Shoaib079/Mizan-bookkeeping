import { describe, expect, it } from "vitest";

import { reviewTabCount } from "@/lib/review-tab-counts";
import { EMPTY_REVIEW_COUNTS } from "@/lib/review-counts-types";

describe("reviewTabCount", () => {
  it("maps review tab hrefs to count fields", () => {
    const byTab = {
      ...EMPTY_REVIEW_COUNTS.by_tab,
      bank: 2,
      invoices: 5,
    };
    expect(reviewTabCount(byTab, "/review/bank")).toBe(2);
    expect(reviewTabCount(byTab, "/review/invoices")).toBe(5);
    expect(reviewTabCount(byTab, "/review/manual-journals")).toBe(0);
  });
});
