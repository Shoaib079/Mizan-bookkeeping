import { describe, expect, it } from "vitest";

import {
  EXPENSE_REVIEW_FILTERS,
  type ExpenseReviewFilter,
} from "@/lib/use-expenses-review-url";

describe("EXPENSE_REVIEW_FILTERS", () => {
  it("includes all, needs_review, and posted tabs", () => {
    expect(EXPENSE_REVIEW_FILTERS.map((tab) => tab.id)).toEqual([
      "all",
      "needs_review",
      "posted",
    ]);
  });
});

describe("ExpenseReviewFilter", () => {
  it("accepts the three filter ids", () => {
    const filters: ExpenseReviewFilter[] = ["all", "needs_review", "posted"];
    expect(filters).toHaveLength(3);
  });
});
