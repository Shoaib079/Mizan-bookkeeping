import { describe, expect, it } from "vitest";

import {
  partnerBalanceAmount,
  partnerBalanceHeading,
  partnerDrawingRepaymentAllowed,
  formatPartnerNetBalance,
} from "@/lib/partner-balance";

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
