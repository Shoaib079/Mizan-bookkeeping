import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const readExpenseItemsPage = () => sourceDeclaring("ExpenseItemsPage");
const readExpenseItemsReviewPanel = () =>
  sourceDeclaring("ExpenseItemsReviewPanel");

describe("expense items legacy route", () => {
  it("redirects /expenses/items to review expenses items view", () => {
    const source = readExpenseItemsPage();
    expect(source).toContain("REVIEW_EXPENSES_ITEMS_HREF");
    expect(source).toContain("redirect(");
  });
});

describe("expense items review panel", () => {
  it("lists items via GET expense-items with debounced search", () => {
    const source = readExpenseItemsReviewPanel();
    expect(source).toContain("expenseItemsListUrl");
    expect(source).toContain("DataTable");
    expect(source).toContain("exp-item-search");
    expect(source).toContain("debouncedQuery");
  });

  it("loads posted totals from time-series", () => {
    const source = readExpenseItemsReviewPanel();
    expect(source).toContain("reports/time-series");
    expect(source).toContain("expenses_by_item");
    expect(source).toContain("Posted in period");
  });

  it("calls merge endpoint with source, target, and actor ids", () => {
    const source = readExpenseItemsReviewPanel();
    expect(source).toContain("/expense-items/merge");
    expect(source).toContain(
      "buildMergeExpenseItemsPayload(sourceId, targetId, actorId)",
    );
  });

  it("requires confirm dialog before merge runs", () => {
    const source = readExpenseItemsReviewPanel();
    expect(source).toContain("shouldRunExpenseItemMerge");
    expect(source).toContain("confirmOpen");
    expect(source).toContain("Merge expense items?");
    expect(source).toContain("mergeExpenseItemsConfirmMessage");
  });

  it("gates merge UI behind owner role", () => {
    const source = readExpenseItemsReviewPanel();
    expect(source).toContain("canManageExpenseItems");
    expect(source).toContain("owner && !loading && rows.length > 0");
  });
});
