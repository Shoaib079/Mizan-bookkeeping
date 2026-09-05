import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("StatementClassifyBar split", () => {
  it("composes target control + correct dialog + hook (not a monolith)", () => {
    const bar = sourceDeclaring("StatementClassifyBar");
    expect(bar).toContain("StatementClassifyTargetControl");
    expect(bar).toContain("StatementClassifyCorrectDialog");
    expect(bar).toContain("useStatementClassifyBar");
    expect(bar).toContain("StaffSalaryPaymentDialog");
    expect(bar).toContain("max-[819px]:flex-col");
  });

  it("mutation: classify/correct posting lives in the hook", () => {
    const bar = sourceDeclaring("StatementClassifyBar");
    const hook = sourceDeclaring("useStatementClassifyBar");
    expect(bar).not.toContain("classifyStatementLine");
    expect(bar).not.toContain("correctStatementLine");
    expect(hook).toContain("classifyStatementLine");
    expect(hook).toContain("correctStatementLine");
    expect(hook).toContain("buildClassifyLinePayload");
  });
});
