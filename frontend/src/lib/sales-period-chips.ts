/** Period chips for Posted daily sales — This month / Last month / Custom.
 *
 * Short rolling windows are intentionally absent. Queues (All / Needs review)
 * still ignore dates; callers only mount this when `salesFilterUsesRange`.
 */

import { currentMonthRange, lastFullMonthRange } from "@/lib/date-range";

export type SalesPeriodChip = "this-month" | "last-month" | "custom";

/** One column from GET …/reports/sales-summary (posted 4000 only). */
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

export const SALES_PERIOD_CHIPS: { id: SalesPeriodChip; label: string }[] = [
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "custom", label: "Custom" },
];

/** Range for a chip. Custom returns null — keep the current custom range. */
export function rangeForSalesPeriodChip(
  chip: SalesPeriodChip,
  reference = new Date(),
): { from: string; to: string } | null {
  if (chip === "this-month") return currentMonthRange(reference);
  if (chip === "last-month") return lastFullMonthRange(reference);
  return null;
}

/** Which chip matches the current URL range (else Custom). */
export function salesPeriodChipForRange(
  from: string,
  to: string,
  reference = new Date(),
): SalesPeriodChip {
  const mtd = currentMonthRange(reference);
  if (from === mtd.from && to === mtd.to) return "this-month";
  const last = lastFullMonthRange(reference);
  if (from === last.from && to === last.to) return "last-month";
  return "custom";
}
