/** FX native quantity formatting (minor units, e.g. cents). */

import { parseTryParts } from "@/lib/money";

export function formatFxNative(quantity: number, currency: string): string {
  const major = quantity / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major);
}

/** Parse user-entered FX amount (e.g. "100,50" or "100.50") → minor units. */
export function parseFxNative(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "");
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
