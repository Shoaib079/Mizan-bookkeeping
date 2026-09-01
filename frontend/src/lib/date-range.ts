/** Date range helpers for dashboard and reports. */

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar date as YYYY-MM-DD (not UTC — avoids off-by-one near midnight). */
export function isoToday(reference = new Date()): string {
  return toIso(reference);
}

/** Month-to-date: first of month through today (inclusive). */
export function currentMonthRange(reference = new Date()): { from: string; to: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const from = new Date(year, month, 1);
  return { from: toIso(from), to: toIso(reference) };
}

/** Full previous calendar month (1st … last day), relative to `reference`. */
export function lastFullMonthRange(reference = new Date()): { from: string; to: string } {
  const lastDay = new Date(reference.getFullYear(), reference.getMonth(), 0);
  const firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
  return { from: toIso(firstDay), to: toIso(lastDay) };
}

/** Clamp report range end to today; reset invalid ranges to month-to-date.
 *
 * `allowFuture` exists for the general ledger, and only for it.
 *
 * Clamping is right for a report: a profit and loss "to" next month is a
 * question with no answer, so the end date is pulled back to today. A ledger
 * is not a report — it is the list of entries that exist. When a misread date
 * put a real invoice six weeks ahead, the clamp meant no range could reach
 * it: typing a future end date silently snapped back to today, and the entry
 * could not be opened, corrected or voided from anywhere in the app.
 *
 * Refusing to *show* an entry does not stop it existing; it stops it being
 * fixed.
 */
export function resolveReportRange(
  fromParam: string | null,
  toParam: string | null,
  defaults: { from: string; to: string } = currentMonthRange(),
  /** Injectable so the clamp is testable — it used to read the real clock even
   * when `defaults` came from a fixed date, which made results drift by day. */
  now: Date = new Date(),
  options: { allowFuture?: boolean } = {},
): { from: string; to: string } {
  const from = fromParam ?? defaults.from;
  let to = toParam ?? defaults.to;
  const today = isoToday(now);
  if (!options.allowFuture && to > today) to = today;
  if (from > to) return currentMonthRange(now);
  return { from, to };
}

/** Full calendar month containing `isoDate` (YYYY-MM-DD). */
export function calendarMonthContaining(
  isoDate: string,
): { from: string; to: string } | null {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [year, month] = parts;
  if (month < 1 || month > 12) return null;
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  return { from: toIso(from), to: toIso(to) };
}

export function buildRangeQuery(from: string, to: string): string {
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}
