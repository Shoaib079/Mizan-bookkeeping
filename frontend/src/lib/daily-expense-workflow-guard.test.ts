import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  RECORD_ACTIONS,
  recordActionsBySection,
} from "@/lib/record-actions";

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

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
    expect(paymentIds).toEqual(["partnerReimbursement"]);
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
    const form = read("components/forms/manual-expense-form.tsx");
    const modals = read("components/record-action-modals.tsx");
    expect(form).not.toContain("bank_card");
    expect(form).not.toContain("paymentSource");
    expect(form).toMatch(/bank statement/i);
    expect(form).toContain("Record expense");
    expect(modals).not.toContain("storePurchase");
  });

  it("review expenses enables salary toggle and matches workflow copy", () => {
    const panel = read("components/review/expenses-review-panel.tsx");
    expect(panel).not.toContain("showRecordKindToggle={false}");
    expect(panel).toMatch(/bank statement/i);
    expect(panel).not.toMatch(/salary is under Staff/i);
  });

  it("partner drawing uses capital balance in people picker", () => {
    const people = read("components/record/people-record-dialog.tsx");
    expect(people).toContain("NEEDS_CAPITAL_BALANCE");
    expect(people).toContain("balanceKurus={capitalBalanceKurus}");
    expect(people).not.toContain("capitalBalanceKurus ?? balanceKurus");
  });
});
