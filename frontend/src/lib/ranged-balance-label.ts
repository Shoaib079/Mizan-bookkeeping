/** Balance sticker / KPI scope: current vs closing-in-range.

Supplier activity is period-scoped; the header sticker used to keep the
current-balance wording even when the page was looking at a past from/to
range. One helper decides the label so the sticker and the activity closing
KPI cannot drift.
*/

import { isoToday } from "@/lib/date-range";
import { formatTrDate } from "@/lib/money";

/**
 * @param rangeTo ISO end date when a from/to range is in force.
 *                Null/undefined → current-balance wording (`currentLabel`).
 *                A to-date on/after today also keeps the current label — the
 *                default month-to-date view is "today's books", not a closed
 *                historical window.
 */
export function rangedBalanceLabel(opts: {
  rangeTo: string | null | undefined;
  /** Existing current-balance label (e.g. supplierBalanceHeading). */
  currentLabel: string;
  /** Injectable for tests — defaults to local calendar today. */
  today?: string;
}): string {
  if (!opts.rangeTo) return opts.currentLabel;
  const today = opts.today ?? isoToday();
  if (opts.rangeTo >= today) return opts.currentLabel;
  return `Closing in range · as of ${formatTrDate(opts.rangeTo)}`;
}
