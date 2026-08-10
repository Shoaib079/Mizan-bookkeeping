import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";



describe("unified record dialogs", () => {
  it("uses one PeopleRecordDialog instead of picker-then-form state", () => {
    const modals = sourceDeclaring("RecordActionModals");
    expect(modals).toContain("PeopleRecordDialog");
    expect(modals).not.toContain("PersonPickerDialog");
    expect(modals).not.toContain("personPickerFor");
    expect(modals).not.toContain("handlePersonContinue");
  });

  it("routes bank statement import to the full-page mapper with file handoff", () => {
    const bank = sourceDeclaring("BankAccountPickerDialog");
    const modals = sourceDeclaring("RecordActionModals");
    expect(bank).toContain("/import");
    expect(bank).toContain("Continue to import");
    expect(bank).toContain("beginStatementImportHandoff");
    expect(bank).toContain("initialFile");
    expect(modals).toContain('routedTo === "bankStatement"');
    expect(bank).not.toContain("StatementUploadForm");
  });

  it("embeds FX forms inline without a Continue step", () => {
    // fx-wallet-action-dialog was superseded by fx-unified-dialog and deleted
    // in the slice 8 sweep; the rule still applies to whatever renders FX.
    const fx = sourceDeclaring("FxUnifiedDialog");
    expect(fx).toContain("embedded");
    expect(fx).not.toContain("formOpen");
    expect(fx).not.toContain("Continue");
  });

  it("loads balance when a person is selected in PeopleRecordDialog", () => {
    const people = sourceDeclaring("PeopleRecordDialog");
    expect(people).toContain("renderEmbeddedForm");
    expect(people).not.toContain("partnerReimbursement");
    expect(people).not.toContain("partnerCapital");
    expect(people).not.toContain("partnerDrawing");
    expect(people).not.toContain("onContinue");
  });

  it("routes staff salary payment through the rich dialog with a picked employee (hidden from Add hub)", () => {
    const people = sourceDeclaring("PeopleRecordDialog");
    const salaryDialog = sourceDeclaring("StaffSalaryPaymentDialog");
    const cashForm = sourceDeclaring("StaffCashMovementForm");
    const staffPage = sourceDeclaring("StaffDetailPage");
    const actions = sourceDeclaring("PERSON_PICKER_ACTIONS");

    expect(actions).toContain('id: "staffPayment"');
    expect(actions).toContain("hidden: true");
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

    const classifyBar = sourceDeclaring("StatementClassifyBar");
    expect(classifyBar).toContain("selectedEmployee");
    expect(classifyBar).not.toContain('?? "Employee"');
    expect(salaryDialog).toContain("!isStatement &&");
    expect(salaryDialog).toContain(
      "Payment posts from this bank statement",
    );
  });

  it("renders dialogs in a portal so sticky headers do not cover modals", () => {
    const dialog = sourceDeclaring("Dialog");
    expect(dialog).toContain("createPortal");
    expect(dialog).toContain("document.body");
  });

  it("manual expense can record salary payments from one daily intake dialog", () => {
    const form = sourceDeclaring("ManualExpenseForm");
    const reviewPanel = sourceDeclaring("ExpensesReviewPanel");
    expect(form).toContain("ExpenseRecordKindToggle");
    expect(form).toContain("StaffSalaryPaymentDialog");
    expect(form).toMatch(/bank statement/i);
    expect(reviewPanel).toContain("ManualExpenseForm");
    expect(reviewPanel).toContain("Record expense");
    expect(reviewPanel).not.toContain("showRecordKindToggle={false}");
  });

  it("opens invoice and receipt review in a dialog on the record page", () => {
    const panel = sourceDeclaring("RecordReviewPanel");
    const efatura = sourceDeclaring("EfaturaUploadForm");
    const receipt = sourceDeclaring("ExpenseReceiptUploadForm");
    const recordPage = sourceDeclaring("RecordPage");
    expect(panel).toContain("<Dialog");
    expect(efatura).toContain("/record?invoice=");
    expect(receipt).toContain("/record?receipt=");
    expect(recordPage).toContain("RecordReviewPanel");
    expect(recordPage).toContain("RecordDesk");
  });
});
