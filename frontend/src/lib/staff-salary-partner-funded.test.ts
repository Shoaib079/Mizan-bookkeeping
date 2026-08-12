/** Partner-funded salary UI + submit helpers. */

import { describe, expect, it, vi } from "vitest";

import { sourceDeclaring } from "@/test-support/source";
import { staffLedgerRowActions } from "@/lib/subledger-actions";
import { postStaffSalaryPayment } from "@/lib/staff-salary-payment-submit";

describe("StaffSalaryFundingFields", () => {
  it("offers Cash drawer and Partner (owe partner)", () => {
    const src = sourceDeclaring("StaffSalaryFundingFields");
    expect(src).toContain("Cash drawer");
    expect(src).toContain("Partner (owe partner)");
    expect(src).toContain("pay-partner");
  });
});

describe("StaffSalaryPaymentDialog — partner-funded path", () => {
  it("wires funding fields and posts partner-funded endpoint", () => {
    const dialog = sourceDeclaring("StaffSalaryPaymentDialog");
    expect(dialog).toContain("StaffSalaryFundingFields");
    expect(dialog).toContain("postStaffSalaryPayment");
    const submit = sourceDeclaring("postStaffSalaryPayment");
    expect(submit).toContain("partner-funded-payments");
    expect(submit).toContain("/payments");
  });
});

describe("postStaffSalaryPayment double-submit", () => {
  it("reuses one idempotency key across two posts", async () => {
    const beginSubmit = vi.fn(() => "stable-key-1");
    const submitWithDuplicateGuard = vi.fn(async (run) => run(false));
    vi.spyOn(await import("@/lib/api"), "apiFetch").mockResolvedValue({} as never);

    const base = {
      entityId: "e1",
      employeeId: "emp1",
      actorId: "a1",
      description: "Salary payment",
      dateText: "01.06.2026",
      isTry: true,
      payCurrency: "TRY",
      fundingMode: "partner" as const,
      partnerId: "p1",
      paymentGlAccountId: "",
      fxWalletId: "",
      tryCostText: "",
      payload: {
        period_year: 2026,
        period_month: 6,
        period_salary_minor: 100_000,
        amount_minor: 100_000,
      },
      beginSubmit,
      submitWithDuplicateGuard,
    };

    expect((await postStaffSalaryPayment(base)).ok).toBe(true);
    expect((await postStaffSalaryPayment(base)).ok).toBe(true);
    expect(beginSubmit.mock.results.map((r) => r.value)).toEqual([
      "stable-key-1",
      "stable-key-1",
    ]);
    expect(submitWithDuplicateGuard).toHaveBeenCalledTimes(2);
  });
});

describe("staffLedgerRowActions partner-funded", () => {
  it("is void-only when salary_payment has no payment account", () => {
    const actions = staffLedgerRowActions({
      movementType: "salary_payment",
      payCurrency: "TRY",
      isAdvanceOffset: false,
      advanceAppliedMinor: 0,
      paymentAccountId: null,
    });
    expect(actions.canEdit).toBe(false);
    expect(actions.canVoid).toBe(true);
  });

  it("still allows edit for cash salary_payment", () => {
    const actions = staffLedgerRowActions({
      movementType: "salary_payment",
      payCurrency: "TRY",
      isAdvanceOffset: false,
      advanceAppliedMinor: 0,
      paymentAccountId: "acct-cash",
    });
    expect(actions.canEdit).toBe(true);
    expect(actions.canVoid).toBe(true);
  });
});
