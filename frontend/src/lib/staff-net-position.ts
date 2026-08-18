/** The staff settlement card — one signed balance, like every other subledger.
 *
 * `balance_minor` is the sum of every ledger row, so it ALREADY nets advances
 * against salary. Subtracting the outstanding advance from it counts the same
 * money twice: an employee holding a 2.730 advance with nothing owed showed a
 * net of −5.460 instead of −2.730 (BUGLOG 2026-07-29).
 *
 * The headline used to be `max(0, salaryOwed − advanceHeld)` under the label
 * "Net to pay". Two problems, and the second is the one that mattered. The
 * clamp deleted the direction: an employee who owed the owner money read as
 * 0,00 with the amount he owed shown nowhere. And the accompanying "how that
 * nets out" panel explained a subtraction that, for a TRY employee, no longer
 * happens at all — the backend now holds min(owed, advance) at zero after
 * every write, so one of the two lines is always empty.
 *
 * "always" has one exception, and it is why the breakdown still exists.
 * The automatic settlement is TRY-only: an FX advance carries a lira cost
 * basis from the day it was paid, and applying it at today's rate would book
 * the expense wrong. So an FX employee genuinely can hold both at once, and
 * `netsOutVisibly` is what asks — rather than the page assuming either way.
 */

import { balanceCaption, balanceHeading } from "@/lib/subledger-balance";

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
  /** Signed: positive you owe them, negative they owe you. The hero figure. */
  balanceMinor: number;
  /** Anything in the balance the two figures above don't explain. Usually 0. */
  otherMinor: number;
};

export function staffNetPosition(
  ledger: StaffLedgerTotals | null | undefined,
): StaffNetPosition {
  const netMinor = ledger?.balance_minor ?? 0;
  const salaryOwedMinor = ledger?.remaining_accrual_minor ?? 0;
  const advanceHeldMinor = ledger?.outstanding_advance_minor ?? 0;
  const balanceMinor = salaryOwedMinor - advanceHeldMinor;
  return {
    netMinor,
    salaryOwedMinor,
    advanceHeldMinor,
    balanceMinor,
    otherMinor: netMinor - balanceMinor,
  };
}

/** True when salary owed less advance held accounts for the whole balance. */
export function netPositionReconciles(position: StaffNetPosition): boolean {
  return position.otherMinor === 0;
}

/** Is there a subtraction worth showing?
 *
 * Only when both sides actually stand — which, since the backend settles them
 * automatically, means an FX employee or a settlement a locked period blocked.
 * A breakdown of one number against zero is the kind of line the owner asked
 * to be rid of.
 */
export function netsOutVisibly(position: StaffNetPosition): boolean {
  return position.salaryOwedMinor > 0 && position.advanceHeldMinor > 0;
}

/** Which way the balance points, in the same words the partner page uses. */
export function staffBalanceHeading(position: StaffNetPosition): string {
  return balanceHeading(position.balanceMinor, "employee");
}

/** Plain-language reading of the settlement card. */
export function netPositionCaption(position: StaffNetPosition): string {
  if (!netPositionReconciles(position)) return "See other movements below";
  return balanceCaption(position.balanceMinor);
}
