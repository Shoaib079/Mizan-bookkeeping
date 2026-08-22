/** Group sale form copy — one source for rate helper and footer suffix wording. */

import { formatTry } from "@/lib/money";

/** Stored on the sale when the owner leaves Note blank — not shown in the form. */
export const GROUP_SALE_DEFAULT_DESCRIPTION = "Group sale";

export const GROUP_SALE_NOTE_PLACEHOLDER =
  "e.g. deposit paid, guide's group…";

/** Reopen for edit/correct: default stored description → empty note field. */
export function groupSaleNoteFromSaved(description: string): string {
  const trimmed = description.trim();
  if (!trimmed || trimmed.toLowerCase() === GROUP_SALE_DEFAULT_DESCRIPTION.toLowerCase()) {
    return "";
  }
  return description;
}

/** POST unchanged: blank note still stores the default description. */
export function groupSaleDescriptionForSubmit(note: string): string {
  const trimmed = note.trim();
  return trimmed || GROUP_SALE_DEFAULT_DESCRIPTION;
}

export const FX_RATE_LABEL_SUFFIX = "(optional)";

export function fxRateFieldLabel(currency: string): string {
  return `Sale-date rate ${FX_RATE_LABEL_SUFFIX} (₺ per 1 ${currency})`;
}

/** Switches with whether a sale-date TRY rate is entered. */
export function fxRateHelperText(currency: string, hasSaleDateRate: boolean): string {
  if (hasSaleDateRate) {
    return "TRY revenue is booked now at this rate.";
  }
  return (
    `Leave blank to keep this sale in ${currency}. No TRY is booked now — ` +
    "TRY is recognized when you convert the forex."
  );
}

export const FX_FOOTER_AT_CONVERSION = "· TRY at FX conversion";

export function forexFooterSuffix(
  fxRateKurus: number | null,
  totalTryPreview: number | null,
  fxRateDisplay: string,
): string | null {
  if (fxRateKurus != null && fxRateKurus > 0) {
    if (totalTryPreview == null) return null;
    const rate = fxRateDisplay.trim() || "—";
    return `· ≈ ${formatTry(totalTryPreview)} booked at ${rate}`;
  }
  return FX_FOOTER_AT_CONVERSION;
}

export function bookingTotalLabel(currency: string): string {
  return currency === "TRY" ? "Total (₺)" : `Total (${currency})`;
}

export function ratePerPersonLabel(currency: string): string {
  return currency === "TRY" ? "Rate / person (₺)" : `Rate / person (${currency})`;
}
