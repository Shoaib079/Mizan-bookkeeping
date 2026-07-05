/** Supplier payable balance display — BSF-2 advances. */

import { formatTry } from "@/lib/money";

/** Matches backend DEFAULT_SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KURUS (₺1,000). */
export const SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KURUS = 100_000;

export function computeSupplierAdvanceKurus(
  balanceKurus: number,
  paymentKurus: number,
): number {
  if (paymentKurus <= 0) return 0;
  if (balanceKurus <= 0) return paymentKurus;
  if (paymentKurus > balanceKurus) return paymentKurus - balanceKurus;
  return 0;
}

/** Human-readable supplier balance — negative = advance / invoice pending. */
export function formatSupplierPayableBalance(kurus: number): string {
  if (kurus < 0) {
    return `${formatTry(Math.abs(kurus))} advance (invoice pending)`;
  }
  return formatTry(kurus);
}

export function isSupplierAdvanceBalance(kurus: number): boolean {
  return kurus < 0;
}
