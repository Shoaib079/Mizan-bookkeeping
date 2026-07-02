import { formatTrDate } from "@/lib/money";
import type { DeliveryReport } from "@/lib/pos-delivery-types";

/** Display label for a delivery sales period (from–to dates). */
export function formatDeliveryPeriod(
  report: Pick<DeliveryReport, "period_start" | "period_end" | "period_year" | "period_month">,
): string {
  if (report.period_start && report.period_end) {
    return `${formatTrDate(report.period_start)} – ${formatTrDate(report.period_end)}`;
  }
  return `${report.period_month}/${report.period_year}`;
}
