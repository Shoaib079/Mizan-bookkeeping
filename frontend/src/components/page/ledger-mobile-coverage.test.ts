import { describe, expect, it } from "vitest";

import { sourceDeclaring } from "@/test-support/source";

/** Staff / partner / customer ledgers and LedgerTable itself must ship a phone
 * card view — either `mobile={` on LedgerTable or MobileCardList in-source.
 * Omitting either silently serves a wide table to a phone. */

describe("ledger mobile coverage", () => {
  it("detail ledgers pass MobileCardList via LedgerTable mobile=", () => {
    for (const name of [
      "StaffDetailLedger",
      "PartnerDetailLedger",
      "CustomerDetailLedger",
    ] as const) {
      const source = sourceDeclaring(name);
      expect(source, name).toContain("MobileCardList");
      expect(source, name).toContain("mobile={");
      expect(source, name).toContain("moneyAmountClassName");
      expect(source, name).toContain("moneyLeadingIcon");
    }
  });

  it("LedgerTable owns the mobile breakpoint and mobile slot", () => {
    const source = sourceDeclaring("LedgerTable");
    expect(source).toContain("useIsMobileShell");
    expect(source).toContain("mobile?: React.ReactNode");
    expect(source).toContain("isMobile && mobile");
  });
});
