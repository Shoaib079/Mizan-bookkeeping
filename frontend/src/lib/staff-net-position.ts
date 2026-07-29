/** The staff net position card — what the business is actually owed or owes.
 *
 * `balance_minor` is the sum of every ledger row, so it ALREADY nets advances
 * against salary. Subtracting the outstanding advance from it counts the same
 * money twice: an employee holding a 2.730 advance with nothing owed showed a
 * net of −5.460 instead of −2.730 (BUGLOG 2026-07-29).
 *
 * The two component lines are `remaining_accrual_minor` (salary accrued but not
 * yet paid, advances excluded) and `outstanding_advance_minor`. They are
 * components, **not** a complete decomposition: incentives, directly-paid extra
 * days and opening balances are real ledger rows that move the balance without
 * belonging to either. So the card shows the residual rather than quietly
 * presenting a subtraction that doesn't add up.
 */

export type StaffLedgerTotals = {
  balance_minor: number;
  remaining_accrual_minor: number;
  outstanding_advance_minor: number;
};

export type StaffNetPosition = {
  /** The truth: every ledger row summed. Negative = the employee holds our money. */
  netMinor: number;
  /** Accrued salary not yet paid. Advances are not part of this. */
  salaryOwedMinor: number;
  /** Advance in the employee's hands, not yet worked off. Always ≥ 0. */
  advanceHeldMinor: number;
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
    otherMinor: netMinor - (salaryOwedMinor - advanceHeldMinor),
  };
}

/** True when salary owed less advance held accounts for the whole balance. */
export function netPositionReconciles(position: StaffNetPosition): boolean {
  return position.otherMinor === 0;
}

/** Plain-language reading of the net figure, so the sign is never ambiguous. */
export function netPositionCaption(position: StaffNetPosition): string {
  if (position.netMinor > 0) return "You owe this to the employee";
  if (position.netMinor < 0) return "The employee holds this much of your money";
  return "Settled — nothing owed either way";
}
