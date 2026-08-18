/** How a staff ledger row names its period and its extra days.
 *
 * Both read only the row, so they belong beside the other display rules rather
 * than inside the page — which is also what made room when the size ratchet
 * objected to the page asking the backend for its verdicts.
 */

/** Short month names, indexed 1-12 so `period_month` reads directly. */
const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type StaffRowLabelFields = {
  movement_type: string;
  extra_days?: number | null;
  period_year?: number | null;
  period_month?: number | null;
};

export function extraDaysLabel(entry: StaffRowLabelFields): string | null {
  if (
    entry.movement_type !== "extra_days_paid" &&
    entry.movement_type !== "extra_days_accrued"
  ) {
    return null;
  }
  if (!entry.extra_days) return null;
  return `${entry.extra_days} day${entry.extra_days === 1 ? "" : "s"}`;
}

export function salaryPeriodLabel(entry: StaffRowLabelFields): string | null {
  if (entry.movement_type !== "salary_accrued") return null;
  if (!entry.period_year || !entry.period_month) return null;
  const month = MONTH_NAMES[entry.period_month] ?? String(entry.period_month);
  return `${month} ${entry.period_year}`;
}
