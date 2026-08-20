/** Partner ledger grouping + filtering (2026-07-14).
 *
 * A partner ledger mixes three unrelated concerns — profit/equity, cash in and
 * out, and expenses a partner paid. Filter chips let the reader look at one at a
 * time; period bands keep each profit allocation legible once several months
 * have accumulated. */

import type { SubledgerDisplayKind } from "@/lib/ledger-display";
import type { EntryActions } from "@/lib/use-entry-actions";

/* The shapes the partner ledger endpoint returns.
 *
 * Declared in the page before this, alongside three other detail pages each
 * declaring its own `LedgerEntry` and `LedgerResponse` — four different shapes
 * sharing two names, so neither could be located by symbol and a guard naming
 * one got an ambiguity error instead of a file. All four are prefixed now.
 *
 * The other three stayed in their pages on purpose: each is the subset of the
 * response *that page* reads, not a shared contract. These moved only because
 * the partner page needed the room.
 */
export type PartnerLedgerEntry = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_kurus: number;
  description: string;
  journal_entry_id: string | null;
  payment_account_id: string | null;
  /** Tells a drawing the partner took in cash from one created by a personal
   * expense split — the two read very differently to an owner. */
  reference_type?: string | null;
  /** The employee, supplier or expense the reference points at, by name.
   * Null where the row points at nothing. */
  subject_name?: string | null;
  display_kind: SubledgerDisplayKind;
  was_corrected?: boolean;
  running_balance_kurus?: number | null;
};

export type PartnerLedgerResponse = {
  /** Verdicts for the rows below, sent with them so the buttons are not late.
   * Absent from an older backend, in which case the page asks separately. */
  entry_actions?: Record<string, EntryActions>;
  balance_kurus: number;
  capital_balance_kurus: number;
  capital_contribution_kurus: number;
  profit_allocated_kurus: number;
  unpaid_profit_kurus?: number;
  drawings_net_kurus: number;
  net_balance_kurus: number;
  current_account_kurus?: number;
  loan_balance_kurus?: number;
  entries: PartnerLedgerEntry[];
};

export type PartnerLedgerFilter = "all" | "profit" | "cash" | "expenses";

export const PARTNER_LEDGER_FILTERS: {
  id: PartnerLedgerFilter;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "profit", label: "Profit" },
  { id: "cash", label: "Cash" },
  { id: "expenses", label: "Expenses" },
];

const PROFIT_TYPES = new Set([
  "profit_allocation",
  "profit_settlement",
  "profit_paid",
]);

const CASH_TYPES = new Set([
  "drawing",
  "drawing_repayment",
  "capital_contribution",
  "partner_loan_received",
  "partner_loan_repaid",
  "reimbursement_paid",
]);

const EXPENSE_TYPES = new Set(["expense_fronted", "salary_fronted"]);

export function partnerLedgerFilterMatches(
  filter: PartnerLedgerFilter,
  movementType: string,
): boolean {
  if (filter === "all") return true;
  if (filter === "profit") return PROFIT_TYPES.has(movementType);
  if (filter === "cash") return CASH_TYPES.has(movementType);
  return EXPENSE_TYPES.has(movementType);
}

function isAllocationRow(movementType: string): boolean {
  return (
    movementType === "profit_allocation" || movementType === "profit_settlement"
  );
}

/** Inside an allocation band the generic labels don't explain the split.
 * "Settled from profit" is true but leaves the reader to work out that it means
 * the share went to clearing what they'd already taken. */
export function allocationRowLabel(movementType: string): string | null {
  if (movementType === "profit_settlement") return "Cleared earlier drawings";
  if (movementType === "profit_allocation") return "Added to capital";
  return null;
}

type BandableRow = {
  movement_type: string;
  movement_date: string;
  journal_entry_id?: string | null;
  amount_kurus?: number;
};

export type LedgerBand<T> = {
  /** Stable key for React. */
  key: string;
  /** What the band groups on — allocation id, or "other". */
  groupKey: string;
  /** Band heading; null renders an unlabelled group. */
  title: string | null;
  /** The partner's whole share for the period, before any netting.
   *
   * The posting engine never writes this as a row: it splits the gross share
   * into a settlement (the part that cleared open drawings) and a smaller
   * capital allocation. A reader seeing only those two has to add them back up
   * to learn what the partner actually earned, so the band carries the total
   * and the rows beneath it read as the breakdown. Null on non-profit bands. */
  grossKurus: number | null;
  rows: T[];
};

const MONTHS = [
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

function monthLabel(isoDate: string): string {
  const [year, month] = isoDate.split("-");
  const index = Number(month) - 1;
  return index >= 0 && index < 12 ? `${MONTHS[index]} ${year}` : isoDate;
}

/** Group newest-first rows so each profit allocation reads as its own block.
 *
 * Consecutive rows from the same allocation (the settlement + capital pair the
 * engine writes together) share one band. Everything else falls into the
 * surrounding "other movements" band, so nothing is ever hidden. */
export function groupPartnerLedgerRows<T extends BandableRow>(
  rows: T[],
): LedgerBand<T>[] {
  const bands: LedgerBand<T>[] = [];

  for (const row of rows) {
    const allocationKey = isAllocationRow(row.movement_type)
      ? `alloc-${row.journal_entry_id ?? row.movement_date}`
      : null;
    const wantedKey = allocationKey ?? "other";
    const last = bands[bands.length - 1];

    if (last && last.groupKey === wantedKey) {
      last.rows.push(row);
      if (allocationKey) {
        last.grossKurus = (last.grossKurus ?? 0) + (row.amount_kurus ?? 0);
      }
      continue;
    }

    bands.push({
      key: `${wantedKey}-${bands.length}`,
      groupKey: wantedKey,
      title: allocationKey
        ? `${monthLabel(row.movement_date)} profit allocation`
        : null,
      grossKurus: allocationKey ? (row.amount_kurus ?? 0) : null,
      rows: [row],
    });
  }

  return bands;
}
