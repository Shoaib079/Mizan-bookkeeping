/** FX native quantity formatting (minor units, e.g. cents). */

import { formatKurus, parseTryParts } from "@/lib/money";

export function formatFxNative(quantity: number, currency: string): string {
  const major = quantity / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major);
}

/** One line of what a customer still owes, or has paid ahead, in one currency.
 *
 * A negative balance is not a negative debt — it means more was received than
 * was ever billed in that currency, so the customer is in credit. Printing it
 * as "Owed: -$298.00" asks the reader to do the sign arithmetic themselves,
 * and reads as a bug even when the figure is right.
 *
 * Shared because the customer page and the Record payment popup both show
 * this, and two copies would drift the moment one of them was corrected.
 */
export function formatForexBalanceLine(
  minor: number,
  currency: string,
): { label: string; amount: string; isCredit: boolean } {
  const isCredit = minor < 0;
  return {
    label: isCredit ? "Paid ahead" : "Owed",
    amount: formatFxNative(Math.abs(minor), currency),
    isCredit,
  };
}

/** Several currencies on one line: "Owed: $94.00 · Paid ahead: €12.00". */
export function formatForexBalanceSummary(
  rows: { currency: string; minor: number }[] | undefined,
): string | null {
  if (!rows || rows.length === 0) return null;
  return rows
    .map((row) => {
      const { label, amount } = formatForexBalanceLine(row.minor, row.currency);
      return `${label}: ${amount}`;
    })
    .join(" · ");
}

/** FX amount for an editable input — plain number, no currency symbol.
 *
 * `formatFxNative` is for display; its output ("$1,000.50") can't be parsed
 * back by `parseFxNative`, so prefilling an input with it made every forex
 * edit fail validation until the user deleted the symbol by hand. */
export function formatFxNativeInput(quantity: number): string {
  return formatKurus(Math.abs(quantity));
}

/** Parse user-entered FX amount (e.g. "100,50", "100.50", "$100.50", "100,50 USD")
 * → minor units. Currency symbols and 3-letter codes are tolerated and ignored. */
export function parseFxNative(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/[$€£₺¥]/g, "")
    .replace(/\b[A-Za-z]{3}\b/g, "")
    .replace(/\s/g, "");
  if (!cleaned) return null;
  if (/[a-zA-Z]/.test(cleaned)) return null;
  const parts = parseTryParts(cleaned);
  if (!parts) return null;
  const fracPadded = parts.frac.padEnd(2, "0");
  const value =
    Number.parseInt(parts.whole, 10) * 100 + Number.parseInt(fracPadded, 10);
  if (!Number.isFinite(value)) return null;
  return value;
}
