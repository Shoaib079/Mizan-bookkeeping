import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("void confirmation UX", () => {
  it("warns before void from row actions and void forms", () => {
    const rowActions = sourceDeclaring("SubledgerRowActions");
    const voidForm = sourceDeclaring("VoidSubledgerDialog");
    const manualForm = sourceDeclaring("VoidManualJournalDialog");
    const groupSale = sourceDeclaring("GroupSaleDetailPage");

    expect(rowActions).toContain("VoidTriggerButton");
    expect(voidForm).toContain("VoidWarningBanner");
    expect(manualForm).toContain("VoidWarningBanner");
    expect(groupSale).toContain("VoidTriggerButton");
    expect(sourceDeclaring("VoidConfirmDialog")).toContain("VoidWarningBanner");
    expect(sourceDeclaring("VoidConfirmDialog")).toContain(
      'title = "Are you sure?"',
    );
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
