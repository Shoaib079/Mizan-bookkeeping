import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("SplitHubPage split", () => {
  it("composes toolbar + lists + dialog via hook (not a monolith)", () => {
    const page = sourceDeclaring("SplitHubPage");
    expect(page).toContain("SplitHubToolbar");
    expect(page).toContain("SplitExpenseList");
    expect(page).toContain("SplitPaymentList");
    expect(page).toContain("SplitHubDialog");
    expect(page).toContain("useSplitHubPage");
    expect(page).toContain("<PageHeader");
  });

  it("mutation: load/submit lives in the hook, not the page shell", () => {
    const page = sourceDeclaring("SplitHubPage");
    expect(page).not.toContain("apiFetch");
    expect(page).not.toContain("/splits/bank-expenses");
    expect(page).not.toContain("beginSubmit");
  });
});
