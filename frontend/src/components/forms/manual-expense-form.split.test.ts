import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("ManualExpenseForm split", () => {
  it("composes fields + salary panel + hook (not a monolith)", () => {
    const form = sourceDeclaring("ManualExpenseForm");
    expect(form).toContain("ManualExpenseFields");
    expect(form).toContain("ManualExpenseSalaryPanel");
    expect(form).toContain("useManualExpenseForm");
  });

  it("mutation: inlining submit apiFetch into the panel fails", () => {
    const form = sourceDeclaring("ManualExpenseForm");
    expect(form).not.toContain("apiFetch");
    expect(form).not.toContain("expenses-fronted");
  });
});
