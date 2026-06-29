import { describe, expect, it } from "vitest";

import {
  buildMergeExpenseItemsPayload,
  canManageExpenseItems,
  canSubmitExpenseItemMerge,
  expenseItemsListUrl,
  mergeExpenseItemsConfirmMessage,
  mergeExpenseItemsErrorMessage,
  shouldRunExpenseItemMerge,
} from "@/lib/expense-item-merge";

describe("canManageExpenseItems", () => {
  it("allows only owners", () => {
    expect(canManageExpenseItems("owner")).toBe(true);
    expect(canManageExpenseItems("partner")).toBe(false);
    expect(canManageExpenseItems("cashier")).toBe(false);
  });
});

describe("expenseItemsListUrl", () => {
  it("includes search query when provided", () => {
    expect(expenseItemsListUrl("ent-1", "peynir")).toBe(
      "/entities/ent-1/expense-items?limit=50&q=peynir",
    );
  });
});

describe("mergeExpenseItemsConfirmMessage", () => {
  it("names both items and warns the action is irreversible", () => {
    expect(mergeExpenseItemsConfirmMessage("yoğurt", "peynir")).toBe(
      "Move all 'yoğurt' entries into 'peynir' and delete 'yoğurt'? This can't be undone.",
    );
  });
});

describe("shouldRunExpenseItemMerge", () => {
  it("requires confirmation and distinct source/target ids", () => {
    expect(shouldRunExpenseItemMerge(false, "a", "b")).toBe(false);
    expect(shouldRunExpenseItemMerge(true, "a", "a")).toBe(false);
    expect(shouldRunExpenseItemMerge(true, "a", "b")).toBe(true);
  });
});

describe("buildMergeExpenseItemsPayload", () => {
  it("sends source, target, and actor ids", () => {
    expect(
      buildMergeExpenseItemsPayload("src", "tgt", "actor-1"),
    ).toEqual({
      source_id: "src",
      target_id: "tgt",
      actor_id: "actor-1",
    });
  });
});

describe("canSubmitExpenseItemMerge", () => {
  it("rejects identical source and target", () => {
    expect(canSubmitExpenseItemMerge("same", "same")).toBe(false);
    expect(canSubmitExpenseItemMerge("a", "b")).toBe(true);
  });
});

describe("mergeExpenseItemsErrorMessage", () => {
  it("maps API status codes to clear messages", () => {
    expect(mergeExpenseItemsErrorMessage(404)).toContain("not found");
    expect(mergeExpenseItemsErrorMessage(422, "alias conflict")).toBe(
      "alias conflict",
    );
  });
});
