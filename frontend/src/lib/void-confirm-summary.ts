/** One-line summary for void confirmation — date, type, amount. */

export function formatVoidConfirmDetail(parts: {
  date?: string | null;
  type?: string | null;
  amount?: string | null;
  /** Fallback when structured fields are unavailable. */
  description?: string | null;
}): string {
  const bits = [parts.date, parts.type, parts.amount]
    .map((part) => part?.trim())
    .filter(Boolean);
  if (bits.length > 0) return bits.join(" · ");
  return parts.description?.trim() ?? "";
}
