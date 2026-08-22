/** Customer receivable balance display — sign is opposite payables subledgers. */

import { balanceHeading } from "@/lib/subledger-balance";

/** Positive balance = customer owes you; negative = you owe customer (credit). */
export function customerBalanceHeading(balanceKurus: number): string {
  if (balanceKurus === 0) return "Nothing outstanding";
  return balanceHeading(-balanceKurus, "customer");
}

/** Flip for `EntityBalanceSticker` colour semantics (they owe / you owe). */
export function customerBalanceStickerMinor(balanceKurus: number): number {
  return -balanceKurus;
}

/** Directory roll-up — keep the aggregate noun when net receivable. */
export function customerDirectoryBalanceLabel(totalKurus: number): string {
  if (totalKurus > 0) return "Total receivable";
  return customerBalanceHeading(totalKurus);
}
