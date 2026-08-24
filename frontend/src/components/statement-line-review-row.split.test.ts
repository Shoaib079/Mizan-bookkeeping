import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("StatementLineReviewRow split", () => {
  it("composes header + actions + correct dialog + hook", () => {
    const row = sourceDeclaring("StatementLineReviewRow");
    expect(row).toContain("StatementLineReviewHeader");
    expect(row).toContain("StatementLineReviewActions");
    expect(row).toContain("StatementLineReviewCorrectDialog");
    expect(row).toContain("useStatementLineReviewRow");
  });

  it("mutation: classify/correct posting lives in the hook", () => {
    const row = sourceDeclaring("StatementLineReviewRow");
    const hook = sourceDeclaring("useStatementLineReviewRow");
    expect(row).not.toContain("classifyStatementLine");
    expect(row).not.toContain("createSupplierFromStatementLine");
    expect(hook).toContain("classifyStatementLine");
    expect(hook).toContain("correctStatementLine");
    expect(hook).toContain("useHydrateOnce");
  });
});
