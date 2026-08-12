/** Partner subledger balance copy (FP — bidirectional). */

import { formatTry } from "@/lib/money";

/** Positive = business owes partner; negative = partner owes business. */
/** The balance a partner reads: profit they are owed, netted against what they
 *  have taken.
 *
 * `net_balance_kurus` leaves out profit already credited and not yet paid,
 * because that figure has a second job — deciding how much of a *new*
 * allocation clears outstanding drawings. Reading it as the partner's position
 * meant the app announced a debt of 80.800 while separately owing them
 * 68.763,91, and left the subtraction to them.
 *
 * Falls back while an older API response is in flight, so the number never
 * renders as zero mid-deploy.
 */
export function partnerBalance(ledger: {
  current_account_kurus?: number;
  net_balance_kurus: number;
}): number {
  return ledger.current_account_kurus ?? ledger.net_balance_kurus;
}

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

/** True when partner has outstanding drawings (negative drawings net). */
export function partnerDrawingRepaymentAllowed(drawingsNetKurus: number): boolean {
  return drawingsNetKurus < 0;
}
