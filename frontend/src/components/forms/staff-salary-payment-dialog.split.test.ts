import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("StaffSalaryPaymentDialog split", () => {
  it("composes period + settle + funding via hook (not a monolith)", () => {
    const dialog = sourceDeclaring("StaffSalaryPaymentDialog");
    expect(dialog).toContain("StaffSalaryPeriodAmounts");
    expect(dialog).toContain("StaffSalarySettlePreview");
    expect(dialog).toContain("StaffSalaryFundingFields");
    expect(dialog).toContain("useStaffSalaryPayment");
  });

  it("mutation: posting lives in the hook, not the dialog shell", () => {
    const dialog = sourceDeclaring("StaffSalaryPaymentDialog");
    expect(dialog).not.toContain("postStaffSalaryPayment");
    expect(dialog).not.toContain("apiFetch");
  });
});
