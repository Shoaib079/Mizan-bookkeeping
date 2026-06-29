import { describe, expect, it } from "vitest";

import {
  isSuggestedAccountActive,
  shouldApplyExpenseAccountSuggestion,
} from "@/lib/expense-account-suggest";

describe("shouldApplyExpenseAccountSuggestion", () => {
  const suggestion = {
    account_id: "acc-rent",
    source: "learned" as const,
    confidence: "high",
  };

  it("applies when user has not manually picked an account", () => {
    expect(
      shouldApplyExpenseAccountSuggestion(suggestion, "", false),
    ).toBe("acc-rent");
  });

  it("does not apply after manual account override", () => {
    expect(
      shouldApplyExpenseAccountSuggestion(suggestion, "acc-other", true),
    ).toBeNull();
  });

  it("does not apply without a suggestion", () => {
    expect(shouldApplyExpenseAccountSuggestion(null, "", false)).toBeNull();
  });
});

describe("isSuggestedAccountActive", () => {
  it("marks the active suggested account", () => {
    expect(isSuggestedAccountActive("acc-rent", "acc-rent")).toBe(true);
    expect(isSuggestedAccountActive("acc-other", "acc-rent")).toBe(false);
  });
});
