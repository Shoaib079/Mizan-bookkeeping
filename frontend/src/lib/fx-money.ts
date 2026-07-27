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
