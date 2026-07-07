import { describe, expect, it } from "vitest";

import {
  buildExpensesReviewListQuery,
  EXPENSE_REVIEW_FILTERS,
  EXPENSE_REVIEW_VIEWS,
  reviewExpensesFilteredHref,
  REVIEW_EXPENSES_ITEMS_HREF,
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

describe("EXPENSE_REVIEW_VIEWS", () => {
  it("includes expenses and items tabs", () => {
    expect(EXPENSE_REVIEW_VIEWS.map((tab) => tab.id)).toEqual([
      "expenses",
      "items",
    ]);
  });
});

describe("ExpenseReviewFilter", () => {
  it("accepts the three filter ids", () => {
    const filters: ExpenseReviewFilter[] = ["all", "needs_review", "posted"];
    expect(filters).toHaveLength(3);
  });
});

describe("buildExpensesReviewListQuery", () => {
  it("includes date range and pagination", () => {
    const query = buildExpensesReviewListQuery({
      from: "2026-07-01",
      to: "2026-07-31",
      offset: 0,
      filter: "all",
    });
    expect(query).toContain("from=2026-07-01");
    expect(query).toContain("to=2026-07-31");
    expect(query).toContain("limit=50");
    expect(query).toContain("offset=0");
  });

  it("adds status and expense_item_id when set", () => {
    const query = buildExpensesReviewListQuery({
      from: "2026-07-01",
      to: "2026-07-31",
      offset: 50,
      filter: "posted",
      expenseItemId: "item-1",
    });
    expect(query).toContain("status=posted");
    expect(query).toContain("expense_item_id=item-1");
    expect(query).toContain("offset=50");
  });
});

describe("review expense hrefs", () => {
  it("points items bookmark to review expenses items view", () => {
    expect(REVIEW_EXPENSES_ITEMS_HREF).toBe("/review/expenses?view=items");
  });

  it("builds filtered expense drill-down href", () => {
    expect(reviewExpensesFilteredHref("abc", "Peynir")).toBe(
      "/review/expenses?item=abc&item_name=Peynir",
    );
  });
});
