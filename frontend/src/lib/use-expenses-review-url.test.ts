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
  it("includes all, needs_review, posted, and voided tabs", () => {
    expect(EXPENSE_REVIEW_FILTERS.map((tab) => tab.id)).toEqual([
      "all",
      "needs_review",
      "posted",
      "voided",
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
  it("does not narrow a list that contains outstanding work", () => {
    // Reversed from the original assertion, deliberately. "all" includes
    // expenses still waiting to be reviewed, and the badge that counts them
    // ignores dates — so a range here means the tab can say 3 while the list
    // shows none, and the date picker looks like the answer when it never is.
    const query = buildExpensesReviewListQuery({
      from: "2026-07-01",
      to: "2026-07-31",
      offset: 0,
      filter: "all",
    });
    expect(query).not.toContain("from=");
    expect(query).not.toContain("to=");
    expect(query).toContain("limit=50");
    expect(query).toContain("offset=0");
  });

  it("still narrows a settled list, where a period is the whole point", () => {
    const query = buildExpensesReviewListQuery({
      from: "2026-07-01",
      to: "2026-07-31",
      offset: 0,
      filter: "posted",
    });
    expect(query).toContain("from=2026-07-01");
    expect(query).toContain("to=2026-07-31");
  });

  it("does not narrow the review queue itself", () => {
    const query = buildExpensesReviewListQuery({
      from: "2026-07-01",
      to: "2026-07-31",
      offset: 0,
      filter: "needs_review",
    });
    expect(query).not.toContain("from=");
    expect(query).toContain("status=needs_review");
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
