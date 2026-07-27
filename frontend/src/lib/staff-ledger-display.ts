/** Staff ledger display grouping — one row per real event.
 *
 * A single staff action can write several subledger rows under ONE journal
 * entry: a salary payment that also consumes an advance writes SALARY_PAYMENT
 * (cash + advance) plus ADVANCE_APPLIED; the explicit apply-advance action
 * writes SALARY_PAYMENT (−X) plus ADVANCE_APPLIED (+X) with no cash at all.
 * Showing those raw is misleading — a "Salary payment" line appears for money
 * that never moved. We group by journal entry and show the NET effect, so the
 * Amount column always reconciles with the running Balance.
 */

export type StaffLedgerRowLike = {
  id: string;
  movement_date: string;
  movement_type: string;
  amount_minor: number;
  description: string;
  journal_entry_id: string | null;
  display_kind?: string;
  was_corrected?: boolean;
};

export type StaffDisplayRow<T extends StaffLedgerRowLike = StaffLedgerRowLike> = {
  /** Row that carries the labels/actions for the group. */
  primary: T;
  /** Combined amount — what actually changed what you owe. */
  netMinor: number;
  /** Portion settled from an outstanding advance (0 when none). */
  advanceAppliedMinor: number;
  /** Portion of the cash that became a NEW advance (paid ahead of any debt). */
  advanceCreatedMinor: number;
  /** True when the group moved no money: advance offset against salary. */
  isAdvanceOffset: boolean;
  /** Running balance after this event (effective rows only). */
  balanceMinor: number | null;
  memberCount: number;
};

const ADVANCE_APPLIED = "advance_applied";
const ADVANCE_PAID = "advance_paid";

function isEffective(row: StaffLedgerRowLike): boolean {
  return (row.display_kind ?? "effective") === "effective";
}

/** Group consecutive rows sharing a journal entry into one display row. */
export function groupStaffLedgerRows<T extends StaffLedgerRowLike>(
  rows: T[],
): StaffDisplayRow<T>[] {
  const groups: T[][] = [];
  for (const row of rows) {
    const previous = groups[groups.length - 1];
    const sameEntry =
      previous &&
      row.journal_entry_id !== null &&
      previous[0].journal_entry_id === row.journal_entry_id;
    if (sameEntry) previous.push(row);
    else groups.push([row]);
  }

  return groups.map((members) => {
    const netMinor = members.reduce((sum, row) => sum + row.amount_minor, 0);
    const advanceAppliedMinor = members
      .filter((row) => row.movement_type === ADVANCE_APPLIED)
      .reduce((sum, row) => sum + Math.abs(row.amount_minor), 0);
    // Only count an advance CREATED alongside other rows (cash paid ahead of
    // debt). A standalone advance is its own row and speaks for itself.
    const advanceCreatedMinor =
      members.length > 1
        ? members
            .filter((row) => row.movement_type === ADVANCE_PAID)
            .reduce((sum, row) => sum + Math.abs(row.amount_minor), 0)
        : 0;
    const primary =
      members.find(
        (row) =>
          row.movement_type !== ADVANCE_APPLIED &&
          row.movement_type !== ADVANCE_PAID,
      ) ?? members[0];
    return {
      primary,
      netMinor,
      advanceAppliedMinor,
      advanceCreatedMinor,
      isAdvanceOffset: netMinor === 0 && advanceAppliedMinor > 0,
      balanceMinor: null,
      memberCount: members.length,
    };
  });
}

/** Attach a running balance over effective groups (oldest first). */
export function withRunningBalance<T extends StaffLedgerRowLike>(
  displayRows: StaffDisplayRow<T>[],
): StaffDisplayRow<T>[] {
  let running = 0;
  return displayRows.map((row) => {
    if (!isEffective(row.primary)) return { ...row, balanceMinor: null };
    running += row.netMinor;
    return { ...row, balanceMinor: running };
  });
}

export function staffDisplayRows<T extends StaffLedgerRowLike>(
  rows: T[],
): StaffDisplayRow<T>[] {
  return withRunningBalance(groupStaffLedgerRows(rows));
}
