import { describe, expect, it } from "vitest";

import { sourceAt, sourceDeclaring } from "@/test-support/source";

/** Leftover money tables must fork to MobileCardList under the 819 shell. */
describe("leftover tables mobile cards", () => {
  it("group-sale menu lines use shell-only cards + desktop table", () => {
    const src = sourceDeclaring("GroupSaleMenuLines");
    expect(src).toContain("MobileCardList");
    expect(src).toContain("MOBILE_SHELL_ONLY");
    expect(src).toContain("DESKTOP_SHELL_ONLY");
    expect(src).toContain("DataTable");
  });

  it("opening-balances journal preview forks at the shell", () => {
    const src = sourceDeclaring("OpeningBalancesJournalPreview");
    expect(src).toContain("MobileCardList");
    expect(src).toContain("MOBILE_SHELL_ONLY");
    expect(src).toContain("DESKTOP_SHELL_ONLY");
  });

  it("partner profit allocation preview forks at the shell", () => {
    const src = sourceDeclaring("PartnerProfitAllocationPreview");
    expect(src).toContain("MobileCardList");
    expect(src).toContain("MOBILE_SHELL_ONLY");
    expect(src).toContain("DESKTOP_SHELL_ONLY");
  });

  it("group-sale detail page composes GroupSaleMenuLines", () => {
    const page = sourceAt(
      "app/(customers-section)/customers/group-sales/[id]/page.tsx",
    );
    expect(page).toContain("GroupSaleMenuLines");
    expect(page).not.toContain("DataTable");
  });
});
