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

/** Clamp report range end to today; reset invalid ranges to month-to-date. */
export function resolveReportRange(
  fromParam: string | null,
  toParam: string | null,
  defaults: { from: string; to: string } = currentMonthRange(),
): { from: string; to: string } {
  const from = fromParam ?? defaults.from;
  let to = toParam ?? defaults.to;
  const today = isoToday();
  if (to > today) to = today;
  if (from > to) return currentMonthRange();
  return { from, to };
}

export function buildRangeQuery(from: string, to: string): string {
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}
