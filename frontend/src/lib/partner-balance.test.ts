import { describe, expect, it } from "vitest";

import {
  extractPartnerBalanceKurus,
  partnerBalance,
  partnerBalanceAmount,
  partnerBalanceHeading,
  partnerDrawingRepaymentAllowed,
  formatPartnerNetBalance,
} from "@/lib/partner-balance";
import { codeOnly, sourceDeclaring } from "@/test-support/source";

describe("partnerBalanceHeading", () => {
  it("labels both directions", () => {
    expect(partnerBalanceHeading(50_000)).toBe("You owe partner");
    expect(partnerBalanceHeading(-30_000)).toBe("Partner owes you");
    expect(partnerBalanceHeading(0)).toBe("Settled");
  });
});

describe("partnerDrawingRepaymentAllowed", () => {
  it("allows repayment only when drawings net is outstanding", () => {
    expect(partnerDrawingRepaymentAllowed(-1)).toBe(true);
    expect(partnerDrawingRepaymentAllowed(0)).toBe(false);
    expect(partnerDrawingRepaymentAllowed(100)).toBe(false);
  });
});

describe("partnerBalanceAmount", () => {
  it("formats absolute value", () => {
    expect(partnerBalanceAmount(-123_456)).toContain("1.234,56");
  });
});

describe("formatPartnerNetBalance", () => {
  it("shows signed net for tables", () => {
    expect(formatPartnerNetBalance(50_000)).toContain("500,00");
    expect(formatPartnerNetBalance(-50_000)).toMatch(/^−/);
    expect(formatPartnerNetBalance(0)).toContain("0,00");
  });
});

/* One partner, one balance, wherever it is printed.
 *
 * `net_balance_kurus` leaves out profit already credited and not yet paid,
 * because it has a second job: deciding how much of a new allocation clears
 * outstanding drawings. Reading it as the partner's position was fixed on the
 * detail page and left in place on the Partners list, so the list showed
 * −80.800,00 next to a detail page saying 12.036,09.
 */
describe("the netted balance reaches every screen", () => {
  it("prefers the current account over the narrower figure", () => {
    expect(
      extractPartnerBalanceKurus({
        current_account_kurus: -1_203_609,
        net_balance_kurus: -8_080_000,
        balance_kurus: 0,
      }),
    ).toBe(-1_203_609);
    expect(partnerBalance({ current_account_kurus: -1, net_balance_kurus: -2 })).toBe(-1);
  });

  it("falls back while an older response is in flight", () => {
    // Mid-deploy the API has not shipped the field yet. Falling through to
    // zero would tell an owner their partner was square.
    expect(extractPartnerBalanceKurus({ net_balance_kurus: -8_080_000 })).toBe(-8_080_000);
    expect(extractPartnerBalanceKurus({ balance_kurus: -55 })).toBe(-55);
    expect(partnerBalance({ net_balance_kurus: -2 })).toBe(-2);
  });

  it("refuses a response with no balance at all", () => {
    // Rather than returning 0, which reads as "settled".
    expect(() => extractPartnerBalanceKurus({})).toThrow(/balance/);
  });

  it("every screen that prints one goes through these", () => {
    /* The fix was applied to the page it was reported on and three other
     * places were left behind. Named here so the next one cannot be. */
    for (const symbol of [
      "PartnersPage",
      "PartnerDetailPage",
      "usePeopleRecordDialog",
      "usePartnerBalanceTotal",
    ]) {
      const source = codeOnly(sourceDeclaring(symbol));
      expect(
        /partnerBalance\(|extractPartnerBalanceKurus/.test(source),
        `${symbol} reads a partner balance without the shared helper`,
      ).toBe(true);
    }
  });
});
