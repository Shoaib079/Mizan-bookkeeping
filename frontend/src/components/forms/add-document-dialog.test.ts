import { describe, it, expect } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("AddDocumentDialog (UX-C)", () => {
  it("exports AddDocumentDialog and DetectedDocumentType", async () => {
    const mod = await import("./add-document-dialog");
    expect(typeof mod.AddDocumentDialog).toBe("function");
  });

  it("calls detect-document-type API on file drop", () => {
    const source = sourceDeclaring("AddDocumentDialog");
    expect(source).toContain("detect-document-type");
    expect(source).toContain('method: "POST"');
  });

  it("sends Idempotency-Key on detect POST", () => {
    const source = sourceDeclaring("AddDocumentDialog");
    expect(source).toContain("newIdempotencyKey");
    expect(source).toMatch(/idempotencyKey:\s*newIdempotencyKey\(\)/);
  });

  it("shows confidence-based UI: confirm for high/medium, picker for low", () => {
    const source = sourceDeclaring("AddDocumentDialog");
    expect(source).toContain('res.confidence === "low"');
    expect(source).toContain("setShowPicker(true)");
    expect(source).toContain("We read this as");
  });

  it("allows user to change detected type via picker", () => {
    const source = sourceDeclaring("AddDocumentDialog");
    expect(source).toContain("Change type");
    expect(source).toContain("Select the document type:");
    expect(source).toContain("ALL_TYPES.map");
  });

  it("routes confirmed type + file to parent via onConfirm", () => {
    const source = sourceDeclaring("AddDocumentDialog");
    expect(source).toContain("onConfirm(selectedType, file)");
  });

  it("does not close parent on confirm so routed file survives", () => {
    const source = sourceDeclaring("AddDocumentDialog");
    expect(source).toContain(
      "do not call handleClose — it clears routed file state",
    );
    expect(source).not.toContain("if (!embedded) handleClose()");
  });

  it("includes delivery report entry from the Upload dialog when delivery is on", () => {
    const source = sourceDeclaring("AddDocumentDialog");
    expect(source).toContain("onOpenDeliveryReport");
    expect(source).toContain("Upload delivery platform report");
    const modals = sourceDeclaring("RecordActionModals");
    expect(modals).toContain('openRecordAction("deliveryReport")');
  });

  it("has labels for all four document types", () => {
    const source = sourceDeclaring("AddDocumentDialog");
    expect(source).toContain('"invoice"');
    expect(source).toContain('"bank_statement"');
    expect(source).toContain('"expense_receipt"');
    expect(source).toContain('"pos_daily_summary"');
  });
});

describe("RecordActionModals routing (UX-C)", () => {
  it("includes AddDocumentDialog in modals", () => {
    const source = sourceDeclaring("RecordActionModals");
    expect(source).toContain("AddDocumentDialog");
    expect(source).toContain('modalAction === "addDocument"');
  });

  it("maps document types to existing form actions", () => {
    const source = sourceDeclaring("RecordActionModals");
    expect(source).toContain('invoice: "efatura"');
    expect(source).toContain('bank_statement: "bankStatement"');
    expect(source).toContain('expense_receipt: "receipt"');
    expect(source).toContain('pos_daily_summary: "posPhoto"');
  });

  it("passes initialFile to routed form components", () => {
    const source = sourceDeclaring("RecordActionModals");
    expect(source).toContain('routedTo === "posPhoto"');
    expect(source).toContain('routedTo === "receipt"');
    expect(source).toContain('routedTo === "efatura"');
    expect(source).toContain("initialFile=");
  });
});

describe("initialFile prop on upload forms", () => {
  it("efatura-upload-form accepts initialFile", () => {
    const source = sourceDeclaring("EfaturaUploadForm");
    expect(source).toContain("initialFile?: File");
    expect(source).toContain("if (initialFile) setFile(initialFile)");
    expect(source).toContain("if (!open)");
  });

  it("expense-receipt-upload-form accepts initialFile", () => {
    const source = sourceDeclaring("ExpenseReceiptUploadForm");
    expect(source).toContain("initialFile?: File");
    expect(source).toContain("if (initialFile) setFile(initialFile)");
    expect(source).toContain("if (!open)");
  });

  it("pos-summary-upload-form accepts initialFile", () => {
    const source = sourceDeclaring("PosSummaryUploadForm");
    expect(source).toContain("initialFile?: File");
    expect(source).toContain("if (initialFile) setFile(initialFile)");
    expect(source).toContain("if (!open)");
  });
});

describe("bank statement path (UX-C stated step)", () => {
  it("hands off uploaded files to the import page", () => {
    const source = sourceDeclaring("BankAccountPickerDialog");
    expect(source).toContain("beginStatementImportHandoff");
    expect(source).toContain("Your file carries over");
  });
});

describe("record-actions addDocument entry", () => {
  it("has addDocument in RecordActionKey", () => {
    const source = sourceDeclaring("RECORD_ACTIONS");
    expect(source).toContain('"addDocument"');
    expect(source).toContain('id: "addDocument"');
    expect(source).toContain('label: "Upload"');
    expect(source).toContain('section: "today"');
  });
});
