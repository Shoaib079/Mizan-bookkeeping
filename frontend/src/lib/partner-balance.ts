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

/** A partner's balance out of a raw ledger response, for the list and the
 *  balances hub.
 *
 * Same precedence as `partnerBalance` above and for the same reason: the
 * netted figure first, `net_balance_kurus` only as a fallback while an older
 * response is in flight. It read the narrow one, so the Partners list showed
 * −80.800,00 against a detail page that said 12.036,09 — one figure fixed on
 * the page it was reported on, and three others left behind it.
 */
export function extractPartnerBalanceKurus(res: unknown): number {
  const body = res as {
    current_account_kurus?: unknown;
    net_balance_kurus?: unknown;
    balance_kurus?: unknown;
  };
  const raw =
    body.current_account_kurus !== undefined
      ? body.current_account_kurus
      : body.net_balance_kurus !== undefined
        ? body.net_balance_kurus
        : body.balance_kurus;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error("partner ledger has no balance figure");
  }
  return n;
}

/** What sits beside the headline figure: capital, and a loan if there is one.
 *
 * Capital is deliberately *not* part of the balance above it — money put into
 * the business is not a debt it repays on demand — but it still has to appear
 * somewhere. The two summary cards were the only place it did, and removing
 * them took it off the page entirely, so it reads as a separate fact here.
 *
 * Capital shows even at zero, because "none in" is an answer. A loan appears
 * only when there is one; most partners have never made one and a permanent
 * "Partner loan: 0,00 ₺" is the kind of line the owner asked to be rid of.
 */
export function partnerHeadlineCaption(ledger: {
  capital_balance_kurus: number;
  loan_balance_kurus?: number;
}): string {
  const lines = [`Capital in business: ${formatTry(ledger.capital_balance_kurus)}`];
  if ((ledger.loan_balance_kurus ?? 0) !== 0) {
    lines.push(`Partner loan: ${formatTry(ledger.loan_balance_kurus!)}`);
  }
  return lines.join(" · ");
}

/** True when partner has outstanding drawings (negative drawings net). */
export function partnerDrawingRepaymentAllowed(drawingsNetKurus: number): boolean {
  return drawingsNetKurus < 0;
}
