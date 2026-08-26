import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

describe("cards page mobile cards", () => {
  it("batches and settlements fork to MobileCardList on phone", () => {
    for (const name of ["CardSalesBatchesTable", "PosSettlementsTable"] as const) {
      const source = sourceDeclaring(name);
      expect(source, name).toContain("MobileCardList");
      expect(source, name).toContain("MobileCardRow");
      expect(source, name).toContain("isMobile");
      expect(source, name).toContain("StatusBadge");
    }
    const batches = sourceDeclaring("CardSalesBatchesTable");
    expect(batches).toContain("CreditCard");
    const settlements = sourceDeclaring("PosSettlementsTable");
    expect(settlements).toContain("Landmark");
    const page = sourceDeclaring("CardsPageContent");
    expect(page).toContain("useIsMobileShell");
    expect(page).toContain("CardSalesBatchesTable");
    expect(page).toContain("PosSettlementsTable");
  });
});
