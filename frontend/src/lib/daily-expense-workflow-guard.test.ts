import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

import {
  RECORD_ACTIONS,
  recordActionsBySection,
} from "@/lib/record-actions";



describe("daily expense workflow (cash/partner/salary only)", () => {
  it("does not expose store/card manual purchase on Add hub or palette", () => {
    const ids = RECORD_ACTIONS.map((action) => action.id);
    expect(ids).not.toContain("storePurchase");

    const today = recordActionsBySection("today", { deliveryEnabled: true });
    expect(today.map((action) => action.id)).not.toContain("storePurchase");
  });

  it("hides duplicate People cards for salary and partner-fronted", () => {
    const payments = recordActionsBySection("payments", { deliveryEnabled: true });
    const paymentIds = payments.map((action) => action.id);
    expect(paymentIds).toEqual(["splitExpense"]);
    expect(paymentIds).not.toContain("partnerReimbursement");
    expect(paymentIds).not.toContain("staffPayment");
    expect(paymentIds).not.toContain("staffAdvance");
    expect(paymentIds).not.toContain("supplierPayment");
    expect(paymentIds).not.toContain("partnerExpenseFronted");
  });

  it("keeps staff accrual and advances off Add (Staff page owns salary workflow)", () => {
    const hidden = RECORD_ACTIONS.filter((a) => a.hidden).map((a) => a.id);
    expect(hidden).toContain("staffAccrual");
    expect(hidden).toContain("staffAdvance");
    expect(hidden).toContain("supplierPayment");
  });

  it("labels the hub card Daily expenses with statement guidance", () => {
    const expense = RECORD_ACTIONS.find((action) => action.id === "expense");
    expect(expense?.label).toBe("Daily expenses");
    expect(expense?.description).toMatch(/statement/i);
    expect(expense?.description).not.toMatch(/salary/i);
  });

  it("manual expense form has no bank/card payment path", () => {
    const form = sourceDeclaring("ManualExpenseForm");
    const fields = sourceDeclaring("ManualExpenseFields");
    const modals = sourceDeclaring("RecordActionModals");
    const surface = form + fields;
    expect(surface).not.toContain("bank_card");
    expect(surface).not.toContain("paymentSource");
    expect(surface).toMatch(/bank statement/i);
    expect(surface).toContain("Record expense");
    expect(modals).not.toContain("storePurchase");
  });

  it("review expenses enables salary toggle and matches workflow copy", () => {
    const panel = sourceDeclaring("ExpensesReviewPanel");
    // The explanatory copy moved to its own component when the page gained a
    // note about what it does *not* list. Read both, so the guard follows the
    // words rather than the file they happen to sit in.
    const copy =
      panel + sourceDeclaring("ExpensesScopeNote");

    expect(panel).not.toContain("showRecordKindToggle={false}");
    expect(copy).toMatch(/bank statement/i);
    expect(copy).not.toMatch(/salary is under Staff/i);
    // Added with the note: the page says plainly that it is not the whole
    // picture, and points at the report that is.
    expect(copy).toMatch(/not your total spend/i);
    expect(copy).toMatch(/reports\/expense-register/);
  });

  it("partner Record lives on the partner page, not PeopleRecordDialog", () => {
    const people = sourceDeclaring("PeopleRecordDialog");
    expect(people).not.toContain("PartnerRecordForm");
    expect(people).not.toContain("partnerReimbursement");
    expect(people).not.toContain("partnerDrawing");
  });
});
