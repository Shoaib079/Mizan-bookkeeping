import { describe, expect, it } from "vitest";

import {
  SALES_REVIEW_FILTERS,
  salesFilterUsesRange,
  type SalesReviewFilter,
} from "@/lib/use-sales-review-url";

describe("SALES_REVIEW_FILTERS", () => {
  it("includes all, pending, and posted tabs", () => {
    expect(SALES_REVIEW_FILTERS.map((tab) => tab.id)).toEqual([
      "all",
      "pending",
      "posted",
    ]);
  });

  it("uses plain labels for owners", () => {
    const labels = SALES_REVIEW_FILTERS.map((tab) => tab.label);
    expect(labels).toContain("Needs review");
    expect(labels).toContain("Posted");
  });
});

describe("salesFilterUsesRange", () => {
  it("honours the period on All and Posted; hides it on Needs review", () => {
    expect(salesFilterUsesRange("all")).toBe(true);
    expect(salesFilterUsesRange("posted")).toBe(true);
    expect(salesFilterUsesRange("pending")).toBe(false);
  });
});

describe("SalesReviewFilter", () => {
  it("accepts the three filter ids", () => {
    const filters: SalesReviewFilter[] = ["all", "pending", "posted"];
    expect(filters).toHaveLength(3);
  });
});
