/** Commission as a share of card sales — the signal that replaces a threshold.
 *
 * Card commission runs at a few percent, so a 10%-of-sales guard would wave
 * through an amount two and a half times too large. But the app cannot hold an
 * opinion about the right rate either: it differs by bank and changes over
 * time, so any constant is a guess that goes stale.
 *
 * So the app asserts nothing and shows the number instead. You know whether
 * 3,8% is right for you; a mistyped 38,2% is obvious on sight. The owner's
 * knowledge is better than any threshold we could bake in
 * (DECISIONS 2026-07-29).
 */

export type CommissionRatePeriod = {
  year: number;
  month: number;
  card_sales_kurus: number;
  commission_kurus: number;
  rate_percent: number | null;
};

export type CommissionRateHistoryRead = {
  periods: CommissionRatePeriod[];
};

/**
 * What a commission amount works out to against card sales.
 *
 * Null when there are no card sales to divide by — a period with no trading
 * has no rate, and showing "0%" or "∞" would both be lies.
 */
export function impliedRatePercent(
  amountKurus: number | null,
  cardSalesKurus: number,
): number | null {
  if (amountKurus === null || amountKurus <= 0) return null;
  if (cardSalesKurus <= 0) return null;
  return Math.round((amountKurus / cardSalesKurus) * 1000) / 10;
}

export function formatRatePercent(rate: number | null): string {
  if (rate === null) return "—";
  return `${rate.toFixed(1).replace(".", ",")}%`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "June 3,7%" — compact enough to sit in a row beside the amount box.
 *
 * The percentage keeps its Turkish decimal comma: it is a figure, and figures
 * in this app read the way they do on a statement. The month is label text. */
export function ratePeriodLabel(period: CommissionRatePeriod): string {
  const name = MONTH_NAMES[period.month - 1] ?? String(period.month);
  return `${name} ${formatRatePercent(period.rate_percent)}`;
}

/**
 * Periods worth showing beside the input — newest first, only those with a
 * rate to show. A month with sales but no commission recorded yet would read
 * as 0,0% and look like a real historic rate, which it isn't.
 */
export function comparableRates(
  history: CommissionRateHistoryRead | null,
  limit = 4,
): CommissionRatePeriod[] {
  if (!history) return [];
  return history.periods
    .filter((p) => p.rate_percent !== null && p.commission_kurus > 0)
    .slice(0, limit);
}
