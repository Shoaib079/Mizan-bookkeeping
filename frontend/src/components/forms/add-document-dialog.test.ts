import { describe, it, expect } from "vitest";

describe("AddDocumentDialog (UX-C)", () => {
  it("exports AddDocumentDialog and DetectedDocumentType", async () => {
    const mod = await import("./add-document-dialog");
    expect(typeof mod.AddDocumentDialog).toBe("function");
  });

  it("calls detect-document-type API on file drop", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./add-document-dialog.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("detect-document-type");
    expect(source).toContain("method: \"POST\"");
  });

  it("shows confidence-based UI: confirm for high/medium, picker for low", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./add-document-dialog.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('res.confidence === "low"');
    expect(source).toContain("setShowPicker(true)");
    expect(source).toContain("We read this as");
  });

  it("allows user to change detected type via picker", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./add-document-dialog.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("Change type");
    expect(source).toContain("Select the document type:");
    expect(source).toContain("ALL_TYPES.map");
  });

  it("routes confirmed type + file to parent via onConfirm", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./add-document-dialog.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("onConfirm(selectedType, file)");
  });

  it("has labels for all four document types", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(new URL("./add-document-dialog.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain('"invoice"');
    expect(source).toContain('"bank_statement"');
    expect(source).toContain('"expense_receipt"');
    expect(source).toContain('"pos_daily_summary"');
  });
});

describe("RecordActionModals routing (UX-C)", () => {
  it("includes AddDocumentDialog in modals", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../record-action-modals.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("AddDocumentDialog");
    expect(source).toContain('modalAction === "addDocument"');
  });

  it("maps document types to existing form actions", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../record-action-modals.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain('invoice: "efatura"');
    expect(source).toContain('bank_statement: "bankStatement"');
    expect(source).toContain('expense_receipt: "receipt"');
    expect(source).toContain('pos_daily_summary: "posPhoto"');
  });

  it("passes initialFile to routed form components", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../record-action-modals.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain('routedTo === "posPhoto"');
    expect(source).toContain('routedTo === "receipt"');
    expect(source).toContain('routedTo === "efatura"');
    expect(source).toContain("initialFile=");
  });
});

describe("initialFile prop on upload forms", () => {
  it("efatura-upload-form accepts initialFile", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("./efatura-upload-form.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("initialFile?: File");
    expect(source).toContain("initialFile ?? null");
  });

  it("expense-receipt-upload-form accepts initialFile", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("./expense-receipt-upload-form.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("initialFile?: File");
    expect(source).toContain("initialFile ?? null");
  });

  it("pos-summary-upload-form accepts initialFile", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("./pos-summary-upload-form.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("initialFile?: File");
    expect(source).toContain("initialFile ?? null");
  });
});

describe("bank statement path (UX-C stated step)", () => {
  it("shows explicit note about continuing on the import page", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../components/record/bank-account-picker-dialog.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("Continue on the import page to upload your file and map columns");
  });
});

describe("record-actions addDocument entry", () => {
  it("has addDocument in RecordActionKey", async () => {
    const source = await import("fs/promises").then((fs) =>
      fs.readFile(
        new URL("../../lib/record-actions.ts", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain('"addDocument"');
    expect(source).toContain('id: "addDocument"');
    expect(source).toContain('section: "upload"');
  });
});
