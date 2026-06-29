import { parseFxNative } from "@/lib/fx-money";
import { parseTryToKurus } from "@/lib/money";

/** TRY paid (kuruş) from foreign amount × rate (TRY per 1 unit). Rate is UI-only. */
export function computeTryCostKurusFromRate(
  nativeText: string,
  rateText: string,
): number | null {
  const nativeQuantity = parseFxNative(nativeText);
  const rateKurus = parseTryToKurus(rateText);
  if (
    nativeQuantity === null ||
    rateKurus === null ||
    nativeQuantity <= 0 ||
    rateKurus <= 0
  ) {
    return null;
  }
  return Math.round((nativeQuantity * rateKurus) / 100);
}

/** Blank description → null for API; backend applies a ledger fallback. */
export function fxPurchaseDescriptionForApi(description: string): string | null {
  const trimmed = description.trim();
  return trimmed ? trimmed : null;
}
