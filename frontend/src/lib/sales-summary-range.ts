/** Period chips for the /sales Sales summary block.
 *
 * Left column = selected range. Right column is always the full calendar
 * month before the selected range's start month (computed by the API).
 * Unlike period comparison, mid-month never uses a same-length prior window.
 */

import { currentMonthRange, lastFullMonthRange } from "@/lib/date-range";
import { formatTrDate } from "@/lib/money";

export type SalesSummaryColumnRead = {
  from_date: string;
  to_date: string;
  full_month: boolean;
  cash_kurus: number;
  card_kurus: number;
  delivery_kurus: number;
  total_kurus: number;
};

export type SalesSummaryRead = {
  entity_id: string;
  delivery_enabled: boolean;
  current: SalesSummaryColumnRead;
  prior: SalesSummaryColumnRead;
};

export type SalesSummaryChip = "this-month" | "last-month" | "custom";

export const SALES_SUMMARY_CHIPS: { id: SalesSummaryChip; label: string }[] = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "custom", label: "Custom" },
];

/** Range for a chip. Custom returns null — keep the current custom range. */
export function rangeForSalesSummaryChip(
  chip: SalesSummaryChip,
  reference = new Date(),
): { from: string; to: string } | null {
  if (chip === "this-month") return currentMonthRange(reference);
  if (chip === "last-month") return lastFullMonthRange(reference);
  return null;
}

/** Muted caption under a column: "01.08.2026 – 24.08.2026" (+ full-month mark). */
export function salesSummaryColumnCaption(
  fromIso: string,
  toIso: string,
  fullMonth: boolean,
): string {
  const span = `${formatTrDate(fromIso)} – ${formatTrDate(toIso)}`;
  return fullMonth ? `${span} · full month` : span;
}
