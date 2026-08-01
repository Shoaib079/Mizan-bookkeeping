/** Partner subledger balance copy (FP — bidirectional). */

import { formatTry } from "@/lib/money";

/** Positive = business owes partner; negative = partner owes business. */
export function partnerBalanceHeading(balanceKurus: number): string {
  if (balanceKurus > 0) return "You owe partner";
  if (balanceKurus < 0) return "Partner owes you";
  return "Settled";
}

export function partnerBalanceAmount(balanceKurus: number): string {
  return formatTry(Math.abs(balanceKurus));
}

/** Signed display for net balance in tables (negative prefix). */
export function formatPartnerNetBalance(balanceKurus: number): string {
  if (balanceKurus === 0) return formatTry(0);
  if (balanceKurus < 0) return `−${formatTry(Math.abs(balanceKurus))}`;
  return formatTry(balanceKurus);
}

export function extractPartnerNetBalanceKurus(res: unknown): number {
  const body = res as {
    net_balance_kurus?: unknown;
    balance_kurus?: unknown;
  };
  const raw =
    body.net_balance_kurus !== undefined
      ? body.net_balance_kurus
      : body.balance_kurus;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error("partner ledger missing net_balance_kurus");
  }
  return n;
}

export function partnerDrawingRepaymentAllowed(capitalBalanceKurus: number): boolean {
  return capitalBalanceKurus < 0;
}
