import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("unified record dialogs", () => {
  it("uses one PeopleRecordDialog instead of picker-then-form state", () => {
    const modals = read("record-action-modals.tsx");
    expect(modals).toContain("PeopleRecordDialog");
    expect(modals).not.toContain("PersonPickerDialog");
    expect(modals).not.toContain("personPickerFor");
    expect(modals).not.toContain("handlePersonContinue");
  });

  it("routes bank statement import to the full-page mapper", () => {
    const bank = read("record/bank-account-picker-dialog.tsx");
    expect(bank).toContain("/import");
    expect(bank).toContain("Continue to import");
    expect(bank).not.toContain("StatementUploadForm");
  });

  it("embeds FX forms inline without a Continue step", () => {
    const fx = read("record/fx-wallet-action-dialog.tsx");
    expect(fx).toContain("embedded");
    expect(fx).not.toContain("formOpen");
    expect(fx).not.toContain("Continue");
  });

  it("loads balance when a person is selected in PeopleRecordDialog", () => {
    const people = read("record/people-record-dialog.tsx");
    expect(people).toContain("partnerReimbursement");
    expect(people).toContain("renderEmbeddedForm");
    expect(people).not.toContain("onContinue");
  });

  it("routes staff salary payment through the rich dialog with a picked employee", () => {
    const people = read("record/people-record-dialog.tsx");
    const salaryDialog = read("forms/staff-salary-payment-dialog.tsx");
    const cashForm = read("forms/staff-cash-movement-form.tsx");
    const staffPage = read("../app/staff/[id]/page.tsx");
    const actions = read("../lib/record-actions.ts");

    expect(actions).toContain('id: "staffPayment"');
    expect(actions).toContain('personKind: "staff"');
    expect(people).toContain('case "staffPayment"');
    expect(people).toContain("StaffSalaryPaymentDialog");
    expect(people).toContain("employeeId={person.id}");
    expect(people).toContain("employeeName={person.name}");
    expect(people).toContain("/staff/employees");
    expect(salaryDialog).toContain("isValidStaffSalaryEmployee");
    expect(salaryDialog).not.toContain('employeeName = "Employee"');
    expect(cashForm).not.toContain("StaffSalaryPaymentDialog");
    expect(cashForm).not.toContain('employeeName = "Employee"');
    expect(staffPage).toContain("StaffSalaryPaymentDialog");
    expect(staffPage).toContain("employeeName={employee.name}");
    expect(salaryDialog).toContain(
      "/staff/employees/${employeeId}/payments",
    );
    expect(salaryDialog).not.toContain("defaultPeriod.year");
    expect(salaryDialog).not.toContain("defaultPeriod.month");

    const classifyBar = read("statement-classify-bar.tsx");
    expect(classifyBar).toContain("selectedEmployee");
    expect(classifyBar).not.toContain('?? "Employee"');
    expect(salaryDialog).toContain("!isStatement &&");
    expect(salaryDialog).toContain(
      "Payment posts from this bank statement",
    );
  });

  it("renders dialogs in a portal so sticky headers do not cover modals", () => {
    const dialog = read("ui/dialog.tsx");
    expect(dialog).toContain("createPortal");
    expect(dialog).toContain("document.body");
  });

  it("manual expense can record salary payments", () => {
    const form = read("forms/manual-expense-form.tsx");
    const expensesPage = read("../app/expenses/page.tsx");
    expect(form).toContain("ExpenseRecordKindToggle");
    expect(form).toContain("StaffSalaryPaymentDialog");
    expect(expensesPage).toContain("ExpenseRecordKindToggle");
    expect(expensesPage).toContain("Pay salary");
  });

  it("opens invoice and receipt review in a dialog on the record page", () => {
    const panel = read("record/record-review-panel.tsx");
    const efatura = read("forms/efatura-upload-form.tsx");
    const receipt = read("forms/expense-receipt-upload-form.tsx");
    const recordPage = read("../app/record/page.tsx");
    expect(panel).toContain("<Dialog");
    expect(efatura).toContain("/record?invoice=");
    expect(receipt).toContain("/record?receipt=");
    expect(recordPage).toContain("RecordReviewPanel");
  });
});
