/** FX native quantity formatting (minor units, e.g. cents). */

export function formatFxNative(quantity: number, currency: string): string {
  const major = quantity / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(major);
}

/** Parse user-entered FX amount (e.g. "100,50") → minor units. */
export function parseFxNative(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) return null;
  return Math.round(value * 100);
}
