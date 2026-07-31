/** The staff settlement card — what to pay next, without double-counting advances.
 *
 * `balance_minor` is the sum of every ledger row, so it ALREADY nets advances
 * against salary. Subtracting the outstanding advance from it counts the same
 * money twice: an employee holding a 2.730 advance with nothing owed showed a
 * net of −5.460 instead of −2.730 (BUGLOG 2026-07-29).
 *
 * Settlement UX (owner 2026-07-31): accrue full salary always; at pay time show
 * **Net to pay** = max(0, salary owed − advance held). Direct-paid extras and
 * incentives may leave an "Other movements" residual on the ledger balance —
 * that is not "the employee holds your money."
 */

export type StaffLedgerTotals = {
  balance_minor: number;
  remaining_accrual_minor: number;
  outstanding_advance_minor: number;
};

export type StaffNetPosition = {
  /** Ledger running balance (every row). Used for residual / other movements. */
  netMinor: number;
  /** Accrued salary not yet paid. Advances are not part of this. */
  salaryOwedMinor: number;
  /** Advance in the employee's hands, not yet worked off. Always ≥ 0. */
  advanceHeldMinor: number;
  /** Cash to pay next: max(0, owed − advance). Hero figure on the employee page. */
  netToPayMinor: number;
  /** Anything in the balance the two lines above don't explain. Usually 0. */
  otherMinor: number;
};

export function staffNetPosition(
  ledger: StaffLedgerTotals | null | undefined,
): StaffNetPosition {
  const netMinor = ledger?.balance_minor ?? 0;
  const salaryOwedMinor = ledger?.remaining_accrual_minor ?? 0;
  const advanceHeldMinor = ledger?.outstanding_advance_minor ?? 0;
  return {
    netMinor,
    salaryOwedMinor,
    advanceHeldMinor,
    netToPayMinor: Math.max(0, salaryOwedMinor - advanceHeldMinor),
    otherMinor: netMinor - (salaryOwedMinor - advanceHeldMinor),
  };
}

/** True when salary owed less advance held accounts for the whole balance. */
export function netPositionReconciles(position: StaffNetPosition): boolean {
  return position.otherMinor === 0;
}

/** Plain-language reading of the settlement card. */
export function netPositionCaption(position: StaffNetPosition): string {
  if (position.netToPayMinor > 0) return "Pay this to settle";
  if (position.advanceHeldMinor > 0 && position.salaryOwedMinor === 0) {
    return "Employee holds this advance";
  }
  if (position.salaryOwedMinor > 0 && position.advanceHeldMinor >= position.salaryOwedMinor) {
    return "Settled by advance — nothing to pay in cash";
  }
  if (!netPositionReconciles(position) && position.otherMinor !== 0) {
    return "See other movements below";
  }
  return "Settled — nothing owed either way";
}
