import { describe, expect, it } from "vitest";

import {
  canApplyGroupSaleDiscount,
  groupSaleDiscountMode,
  groupSaleHasOutstanding,
  tryDiscountFromNativeAtSaleRate,
} from "@/lib/group-sale-discount";
import type { GroupSaleRead } from "@/lib/group-sales-types";

function sale(
  overrides: Partial<GroupSaleRead> = {},
): Pick<
  GroupSaleRead,
  | "status"
  | "total_kurus"
  | "forex_currency"
  | "total_forex_minor"
  | "remaining_kurus"
  | "remaining_forex_minor"
  | "fx_rate_used"
  | "currency"
> {
  return {
    status: "posted",
    currency: "USD",
    total_kurus: 1_750_000,
    forex_currency: "USD",
    total_forex_minor: 50_000,
    remaining_kurus: 1_750_000,
    remaining_forex_minor: 50_000,
    fx_rate_used: 3_500,
    ...overrides,
  };
}

describe("canApplyGroupSaleDiscount", () => {
  it("shows for rated FX while native outstanding", () => {
    expect(canApplyGroupSaleDiscount(sale(), true)).toBe(true);
  });

  it("shows for TRY while TRY outstanding", () => {
    expect(
      canApplyGroupSaleDiscount(
        sale({
          currency: "TRY",
          total_kurus: 500_000,
          forex_currency: null,
          total_forex_minor: null,
          remaining_kurus: 500_000,
          remaining_forex_minor: null,
          fx_rate_used: null,
        }),
        true,
      ),
    ).toBe(true);
  });

  it("shows for forex-only while native outstanding", () => {
    expect(
      canApplyGroupSaleDiscount(
        sale({
          total_kurus: 0,
          remaining_kurus: 0,
          remaining_forex_minor: 50_000,
        }),
        true,
      ),
    ).toBe(true);
  });

  it("hides when settled", () => {
    expect(
      canApplyGroupSaleDiscount(
        sale({ remaining_kurus: 0, remaining_forex_minor: 0 }),
        true,
      ),
    ).toBe(false);
  });

  it("hides without write grant", () => {
    expect(canApplyGroupSaleDiscount(sale(), false)).toBe(false);
  });
});

describe("groupSaleDiscountMode", () => {
  it("classifies rated, forex-only, and TRY", () => {
    expect(groupSaleDiscountMode(sale())).toBe("rated_fx");
    expect(
      groupSaleDiscountMode(
        sale({ total_kurus: 0, fx_rate_used: null }),
      ),
    ).toBe("forex_only");
    expect(
      groupSaleDiscountMode(
        sale({
          currency: "TRY",
          forex_currency: null,
          total_kurus: 500_000,
          fx_rate_used: null,
        }),
      ),
    ).toBe("try");
  });
});

describe("tryDiscountFromNativeAtSaleRate", () => {
  it("echoes TRY at the sale rate", () => {
    expect(tryDiscountFromNativeAtSaleRate(5_000, 3_500)).toBe(175_000);
  });
});

describe("groupSaleHasOutstanding", () => {
  it("uses native for FX and kuruş for TRY", () => {
    expect(groupSaleHasOutstanding(sale())).toBe(true);
    expect(
      groupSaleHasOutstanding(
        sale({
          currency: "TRY",
          forex_currency: null,
          total_forex_minor: null,
          remaining_forex_minor: null,
          remaining_kurus: 1,
        }),
      ),
    ).toBe(true);
  });
});
