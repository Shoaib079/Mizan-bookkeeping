import { describe, expect, it } from "vitest";

import {
  clearConfirmItemOnTextEdit,
  expenseItemSearchUrl,
  shouldSearchExpenseItems,
} from "@/lib/expense-item-search";

describe("shouldSearchExpenseItems", () => {
  it("requires at least two characters", () => {
    expect(shouldSearchExpenseItems("p")).toBe(false);
    expect(shouldSearchExpenseItems("pe")).toBe(true);
  });
});

describe("clearConfirmItemOnTextEdit", () => {
  it("clears when text diverges from the picked canonical name", () => {
    expect(clearConfirmItemOnTextEdit("item-1", "peynir", "peynir")).toBe(false);
    expect(clearConfirmItemOnTextEdit("item-1", "peynir", "paneer")).toBe(true);
  });

  it("does nothing when no item was picked", () => {
    expect(clearConfirmItemOnTextEdit(null, null, "paneer")).toBe(false);
  });
});

describe("expenseItemSearchUrl", () => {
  it("builds the expense-items search endpoint", () => {
    expect(expenseItemSearchUrl("ent-1", "peyn")).toBe(
      "/entities/ent-1/expense-items?q=peyn&limit=8",
    );
  });
});
