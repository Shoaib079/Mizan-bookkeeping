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
};

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
  drawingsTakenKurus: number;
  /** Positive when the partner still owes money taken out. */
  drawingsOutstandingKurus: number;
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
  } = {},
): PartnerCashSummary {
  const live = effectiveRows(rows);
  // drawing rows are negative; report what was taken as a positive figure.
  const drawingsTaken = magnitude(sumByType(live, "drawing"));
  const contributions =
    totals.capitalContributionKurus ?? sumByType(live, "capital_contribution");
  const fronted =
    totals.reimbursementBalanceKurus ?? sumByType(live, "expense_fronted");
  // drawings_net is negative while money is still out.
  const net = totals.drawingsNetKurus ?? 0;

  return {
    drawingsTakenKurus: drawingsTaken,
    drawingsOutstandingKurus: net < 0 ? magnitude(net) : 0,
    expensesFrontedKurus: fronted,
    capitalContributedKurus: contributions,
    capitalInBusinessKurus: totals.capitalBalanceKurus ?? 0,
  };
}
