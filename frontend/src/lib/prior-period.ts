/** What a period comparison compares against.
 *
 * The backend picks a sensible default (`_prior_period`): a whole month against
 * the previous month, a whole year against the previous year, month-to-date
 * against the same dates last month, anything else against the equal-length
 * window before it. That covers most readings, but "most" is not "all" — a
 * seasonal business wants last year, a weekly review wants the week before.
 *
 * So the mode is explicit. `auto` sends nothing and lets the backend choose;
 * every other mode computes the range here and sends it, which the API has
 * always accepted through `prior_from`/`prior_to`.
 */

export type PriorPeriodMode =
  | "auto"
  | "previous"
  | "last-month"
  | "last-year";

export const PRIOR_PERIOD_MODES: {
  id: PriorPeriodMode;
  label: string;
  hint: string;
}[] = [
  { id: "auto", label: "Automatic", hint: "Whatever fits the dates you chose" },
  {
    id: "previous",
    label: "Period before this one",
    hint: "The same number of days, ending the day before",
  },
  {
    id: "last-month",
    label: "Same dates last month",
    hint: "1–15 August against 1–15 July",
  },
  {
    id: "last-year",
    label: "Same dates last year",
    hint: "For a business with a season",
  },
];

function iso(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parse(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Shift a date back by whole months, clamping to the target month's length so
 * 31 March lands on 28 February rather than rolling into March. */
function shiftMonths(value: Date, months: number): Date {
  const target = new Date(value.getFullYear(), value.getMonth() - months, 1);
  const day = Math.min(
    value.getDate(),
    lastDayOfMonth(target.getFullYear(), target.getMonth()),
  );
  return new Date(target.getFullYear(), target.getMonth(), day);
}

/** Whether a mode yields a comparison worth making.
 *
 * "Same dates last month" against a whole year would return December 2025 to
 * November 2026 — a period that overlaps eleven months of the one it is being
 * compared to. Comparing a period partly against itself is not a comparison,
 * so the chooser offers only the modes that clear the current range.
 */
export function priorPeriodIsUsable(
  mode: PriorPeriodMode,
  from: string,
  to: string,
): boolean {
  const prior = priorPeriodFor(mode, from, to);
  if (!prior) return true;
  return prior.to < from;
}

/** The prior range for a mode, or null for `auto` (the backend decides). */
export function priorPeriodFor(
  mode: PriorPeriodMode,
  from: string,
  to: string,
): { from: string; to: string } | null {
  if (mode === "auto") return null;

  const start = parse(from);
  const end = parse(to);

  if (mode === "previous") {
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const priorTo = new Date(start);
    priorTo.setDate(priorTo.getDate() - 1);
    const priorFrom = new Date(priorTo);
    priorFrom.setDate(priorFrom.getDate() - (days - 1));
    return { from: iso(priorFrom), to: iso(priorTo) };
  }

  const months = mode === "last-month" ? 1 : 12;
  return {
    from: iso(shiftMonths(start, months)),
    to: iso(shiftMonths(end, months)),
  };
}
