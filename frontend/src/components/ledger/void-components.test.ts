import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("void confirmation UX", () => {
  it("warns before void from row actions and void forms", () => {
    const rowActions = read("ledger/subledger-row-actions.tsx");
    const voidForm = read("forms/void-subledger-dialog.tsx");
    const manualForm = read("forms/void-manual-journal-dialog.tsx");
    const groupSale = read(
      "../app/(customers-section)/customers/group-sales/[id]/page.tsx",
    );

    expect(rowActions).toContain("VoidTriggerButton");
    expect(voidForm).toContain("VoidWarningBanner");
    expect(manualForm).toContain("VoidWarningBanner");
    expect(groupSale).toContain("VoidTriggerButton");
    expect(read("ledger/void-confirm-dialog.tsx")).toContain("VoidWarningBanner");
    expect(read("ledger/void-warning-banner.tsx")).toContain(
      "This cannot be undone",
    );
  });
});
