import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

const ROOT = join(__dirname, "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("void confirmation UX", () => {
  it("warns before void from row actions and void forms", () => {
    const rowActions = sourceDeclaring("SubledgerRowActions");
    const voidForm = sourceDeclaring("VoidSubledgerDialog");
    const manualForm = sourceDeclaring("VoidManualJournalDialog");
    const groupSale = read(
      "../app/(customers-section)/customers/group-sales/[id]/page.tsx",
    );

    expect(rowActions).toContain("VoidTriggerButton");
    expect(voidForm).toContain("VoidWarningBanner");
    expect(manualForm).toContain("VoidWarningBanner");
    expect(groupSale).toContain("VoidTriggerButton");
    expect(sourceDeclaring("VoidConfirmDialog")).toContain("VoidWarningBanner");
    expect(sourceDeclaring("VoidConfirmDialog")).toContain(
      'mobilePresentation="sheet"',
    );
    expect(voidForm).toContain('mobilePresentation="sheet"');
    expect(manualForm).toContain('mobilePresentation="sheet"');
    expect(sourceDeclaring("VoidWarningBanner")).toContain(
      "This cannot be undone",
    );
  });
});
