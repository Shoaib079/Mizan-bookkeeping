/** Partner subledger balance copy (FP — bidirectional). */

import { formatTry } from "@/lib/money";

export function partnerBalanceHeading(balanceKurus: number): string {
  if (balanceKurus > 0) return "You owe partner";
  if (balanceKurus < 0) return "Partner owes you";
  return "Settled";
}

export function partnerBalanceAmount(balanceKurus: number): string {
  return formatTry(Math.abs(balanceKurus));
}

export function partnerDrawingRepaymentAllowed(capitalBalanceKurus: number): boolean {
  return capitalBalanceKurus < 0;
}
