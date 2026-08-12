/** Partner page summary — profit kept separate from cash (2026-07-14).
 *
 * Derived from the ledger rows the API already returns; no new endpoint.
 * Sign conventions (backend `core/partners/posting.py`):
 *   profit_allocation   +  credited to the partner's capital
 *   profit_settlement   +  the part of the share that cleared open drawings
 *   profit_paid         −  paid out in cash/bank
 *   drawing             −  cash taken out
 *   drawing_repayment   +  cash returned
 *   expense_fronted     +  partner paid a business cost personally
 *   salary_fronted      +  partner paid staff salary from pocket
 *   capital_contribution +
 *
 * The partner's total earned share for a period = settlement + allocation
 * (the engine splits one gross share across those two rows when netting).
 */

import {
  isEffectiveLedgerRow,
  type SubledgerDisplayRow,
} from "@/lib/ledger-display";

export type PartnerSummaryRow = SubledgerDisplayRow & {
  movement_type: string;
  amount_kurus: number;
  journal_entry_id?: string | null;
  movement_date?: string;
  /** What wrote the row — see `SPLIT_REFERENCE_TYPES`. */
  reference_type?: string | null;
};

/** A `drawing` row can mean two different things. Either the partner withdrew
 * cash, or the business paid a personal cost of theirs and the personal share
 * was peeled off (the /split flow). Both reduce capital identically, so the
 * books don't care — but a partner who has never touched the till should not
 * read "drawings taken" and think they did. Rows created by a split carry the
 * originating record's type; a real withdrawal carries none. */
const SPLIT_REFERENCE_TYPES = new Set(["expense_entry", "supplier_ledger_entry"]);

export function isPersonalSplitDrawing(row: PartnerSummaryRow): boolean {
  return (
    row.movement_type === "drawing" &&
    SPLIT_REFERENCE_TYPES.has(row.reference_type ?? "")
  );
}

export type PartnerProfitSummary = {
  /** Every lira of profit ever assigned to this partner (settled + kept). */
  allocatedKurus: number;
  /** Part of that share that repaid open drawings instead of adding capital. */
  usedForDrawingsKurus: number;
  /** Part paid out in cash or bank. */
  paidOutKurus: number;
  /** What is still owed to the partner from profit. */
  unpaidKurus: number;
  /** How many allocation events contributed (distinct journal entries). */
  periodCount: number;
};

export type PartnerCashSummary = {
  /** Everything taken out — cash plus personal costs the business covered. */
  drawingsTakenKurus: number;
  /** Money the partner actually withdrew. */
  cashTakenKurus: number;
  /** Personal share of business expenses, peeled off via /split. */
  personalCostsKurus: number;
  /** Drawings no settlement posting has cleared yet. Gross: it takes no
   *  account of profit the partner is owed. */
  drawingsOutstandingKurus: number;
  /** How much of that is met by what the business owes them — unpaid profit,
   *  and any fronted expenses or loans. Zero when nothing offsets it. */
  offsetByBalancesKurus: number;
  /** What the partner actually owes once that offset is applied. Taken from
   *  the ledger's own balance rather than recomputed here, so the card cannot
   *  end on a different figure from the one at the top of the page — the two
   *  were saying 80.800 and 12.036,09 on the same screen. */
  netOwedByPartnerKurus: number;
  expensesFrontedKurus: number;
  capitalContributedKurus: number;
  capitalInBusinessKurus: number;
};

function sumByType(rows: PartnerSummaryRow[], type: string): number {
  return rows
    .filter((row) => row.movement_type === type)
    .reduce((total, row) => total + row.amount_kurus, 0);
}

/** Flip a negative-signed total to a display magnitude, never producing -0
 * (which would render as "−0,00 ₺" on an empty partner). */
function magnitude(total: number): number {
  return total === 0 ? 0 : -total;
}

/** Voided and superseded rows never count toward a figure on screen. */
export function effectiveRows(rows: PartnerSummaryRow[]): PartnerSummaryRow[] {
  return rows.filter((row) => isEffectiveLedgerRow(row));
}

export function partnerProfitSummary(
  rows: PartnerSummaryRow[],
  /** Authoritative unpaid figure from the API when present. */
  unpaidProfitKurus?: number,
): PartnerProfitSummary {
  const live = effectiveRows(rows);
  const allocation = sumByType(live, "profit_allocation");
  const settlement = sumByType(live, "profit_settlement");
  // profit_paid rows are negative; report the magnitude.
  const paidOut = magnitude(sumByType(live, "profit_paid"));

  const allocationEntryIds = new Set(
    live
      .filter(
        (row) =>
          row.movement_type === "profit_allocation" ||
          row.movement_type === "profit_settlement",
      )
      .map((row) => row.journal_entry_id ?? row.movement_date ?? ""),
  );
  allocationEntryIds.delete("");

  return {
    allocatedKurus: allocation + settlement,
    usedForDrawingsKurus: settlement,
    paidOutKurus: paidOut,
    unpaidKurus: unpaidProfitKurus ?? allocation - paidOut,
    periodCount: allocationEntryIds.size,
  };
}

export function partnerCashSummary(
  rows: PartnerSummaryRow[],
  totals: {
    drawingsNetKurus?: number;
    capitalContributionKurus?: number;
    capitalBalanceKurus?: number;
    reimbursementBalanceKurus?: number;
    /** The netted position the page's headline shows. */
    currentAccountKurus?: number;
  } = {},
): PartnerCashSummary {
  const live = effectiveRows(rows);
  // drawing rows are negative; report what was taken as a positive figure.
  const drawingRows = live.filter((row) => row.movement_type === "drawing");
  const sumRows = (subset: PartnerSummaryRow[]) =>
    magnitude(subset.reduce((total, row) => total + row.amount_kurus, 0));
  const personalCosts = sumRows(drawingRows.filter(isPersonalSplitDrawing));
  const cashTaken = sumRows(
    drawingRows.filter((row) => !isPersonalSplitDrawing(row)),
  );
  const drawingsTaken = cashTaken + personalCosts;
  const contributions =
    totals.capitalContributionKurus ?? sumByType(live, "capital_contribution");
  const fronted =
    totals.reimbursementBalanceKurus ??
    sumByType(live, "expense_fronted") + sumByType(live, "salary_fronted");
  // drawings_net is negative while money is still out.
  const net = totals.drawingsNetKurus ?? 0;
  const outstanding = net < 0 ? magnitude(net) : 0;
  // current account is negative while the partner owes, after profit.
  const current = totals.currentAccountKurus ?? 0;
  const owed = current < 0 ? magnitude(current) : 0;

  return {
    drawingsTakenKurus: drawingsTaken,
    cashTakenKurus: cashTaken,
    personalCostsKurus: personalCosts,
    drawingsOutstandingKurus: outstanding,
    // The difference, not the unpaid profit itself, so the three lines always
    // add up. Fronted expenses and partner loans sit in the same balance and
    // would otherwise leave the column short.
    offsetByBalancesKurus: Math.max(0, outstanding - owed),
    netOwedByPartnerKurus: owed,
    expensesFrontedKurus: fronted,
    capitalContributedKurus: contributions,
    capitalInBusinessKurus: totals.capitalBalanceKurus ?? 0,
  };
}
