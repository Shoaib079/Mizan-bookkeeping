/** When the group-sale detail page may offer Apply discount. */

import type { GroupSaleRead } from "@/lib/group-sales-types";

export function isForexOnlyGroupSale(
  sale: Pick<GroupSaleRead, "total_kurus" | "forex_currency">,
): boolean {
  return sale.total_kurus === 0 && Boolean(sale.forex_currency);
}

export function groupSaleHasOutstanding(
  sale: Pick<
    GroupSaleRead,
    | "total_kurus"
    | "forex_currency"
    | "total_forex_minor"
    | "remaining_kurus"
    | "remaining_forex_minor"
  >,
): boolean {
  const isForex = Boolean(sale.forex_currency && sale.total_forex_minor != null);
  if (isForexOnlyGroupSale(sale) || isForex) {
    return (sale.remaining_forex_minor ?? 0) > 0;
  }
  return (sale.remaining_kurus ?? 0) > 0;
}

export function canApplyGroupSaleDiscount(
  sale: Pick<
    GroupSaleRead,
    | "status"
    | "total_kurus"
    | "forex_currency"
    | "total_forex_minor"
    | "remaining_kurus"
    | "remaining_forex_minor"
  >,
  showWrite: boolean,
): boolean {
  return (
    showWrite && sale.status === "posted" && groupSaleHasOutstanding(sale)
  );
}

export type GroupSaleDiscountMode = "try" | "rated_fx" | "forex_only";

export function groupSaleDiscountMode(
  sale: Pick<
    GroupSaleRead,
    "total_kurus" | "forex_currency" | "fx_rate_used"
  >,
): GroupSaleDiscountMode {
  if (isForexOnlyGroupSale(sale)) return "forex_only";
  if (sale.forex_currency && sale.total_kurus > 0 && sale.fx_rate_used != null) {
    return "rated_fx";
  }
  return "try";
}

export function tryDiscountFromNativeAtSaleRate(
  discountNativeMinor: number,
  fxRateUsedKurus: number,
): number {
  return Math.round((discountNativeMinor * fxRateUsedKurus) / 100);
}
