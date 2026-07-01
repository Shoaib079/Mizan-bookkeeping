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
});
