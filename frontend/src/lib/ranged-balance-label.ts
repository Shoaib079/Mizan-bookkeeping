/** Activity Closing KPI scope: current closing vs closing-in-range.

The supplier header sticker always shows today's ledger balance and is
labelled "Current balance" — it must not use this helper. Only the activity
Closing KPI uses it, so the two figures on screen cannot share one label.
*/

import { isoToday } from "@/lib/date-range";
import { formatTrDate } from "@/lib/money";

/**
 * @param rangeTo ISO end date when a from/to range is in force.
 *                Null/undefined → `currentLabel` (e.g. "Closing").
 *                A to-date on/after today also keeps `currentLabel` — MTD
 *                through today is not a closed historical window.
 */
export function rangedBalanceLabel(opts: {
  rangeTo: string | null | undefined;
  /** Label when there is no past range (e.g. "Closing"). */
  currentLabel: string;
  /** Injectable for tests — defaults to local calendar today. */
  today?: string;
}): string {
  if (!opts.rangeTo) return opts.currentLabel;
  const today = opts.today ?? isoToday();
  if (opts.rangeTo >= today) return opts.currentLabel;
  return `Closing in range · as of ${formatTrDate(opts.rangeTo)}`;
}
