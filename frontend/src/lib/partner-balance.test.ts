import { describe, expect, it } from "vitest";

import {
  partnerBalanceAmount,
  partnerBalanceHeading,
  partnerDrawingRepaymentAllowed,
} from "@/lib/partner-balance";

describe("partnerBalanceHeading", () => {
  it("labels both directions", () => {
    expect(partnerBalanceHeading(50_000)).toBe("You owe partner");
    expect(partnerBalanceHeading(-30_000)).toBe("Partner owes you");
    expect(partnerBalanceHeading(0)).toBe("Settled");
  });
});

describe("partnerDrawingRepaymentAllowed", () => {
  it("allows repayment only when partner owes the business", () => {
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
