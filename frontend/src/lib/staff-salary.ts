/** Salary payment advance + period preview (mirrors backend posting). */

import { formatKurus } from "@/lib/money";

/** Generic picker placeholder — not a real employee name. */
export const STAFF_SALARY_EMPLOYEE_PLACEHOLDER = "Employee";

/** Whole days only — reject "1.5", "2abc", empty, zero. */
export function parseStrictExtraDays(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 31) return null;
  return n;
}

/** Prefill cash field with net-to-pay (Turkish grouping for TRY). */
export function formatCashPrefill(netToPayMinor: number, isTry: boolean): string {
  if (netToPayMinor <= 0) return "";
  if (isTry) return formatKurus(netToPayMinor);
  return (netToPayMinor / 100).toFixed(2);
}

/** Cash the owner should pay: max(0, total owed − advance held). */
export function netToPayMinor(
  totalOwedMinor: number,
  outstandingAdvanceMinor: number,
): number {
  return Math.max(0, totalOwedMinor - Math.max(0, outstandingAdvanceMinor));
}

export function isValidStaffSalaryEmployee(
  employeeId: string | undefined,
  employeeName: string | undefined,
): boolean {
  const id = employeeId?.trim() ?? "";
  const name = employeeName?.trim() ?? "";
  if (!id || !name) return false;
  if (name === STAFF_SALARY_EMPLOYEE_PLACEHOLDER) return false;
  return true;
}

export type SalaryPeriodStatus = {
  employee_id: string;
  period_year: number;
  period_month: number;
  period_salary_minor: number;
  period_paid_minor: number;
  period_remaining_minor: number;
  outstanding_advance_minor: number;
  /** Everything owed across all periods incl. extra days (advance nets here). */
  total_owed_minor?: number;
};

/** Mirrors backend post_period_salary_payment (2026-07-13): cash settles all
 * owed, the advance clears what's left owed, only true surplus parks. The
 * `owedMinor` arg is total owed (incl. extra days), falling back to the
 * period's remaining when the caller has nothing better. */
export function advanceAppliedPreview(
  cashMinor: number,
  owedMinor: number,
  outstandingAdvanceMinor: number,
): number {
  if (outstandingAdvanceMinor <= 0 || owedMinor <= 0) return 0;
  const salaryCash = Math.min(cashMinor, Math.max(0, owedMinor));
  return Math.max(0, Math.min(outstandingAdvanceMinor, owedMinor - salaryCash));
}

export function salaryCashPreview(
  cashMinor: number,
  owedMinor: number,
  _outstandingAdvanceMinor: number,
): number {
  // Cash settles owed first; the advance only clears what cash didn't.
  return Math.min(cashMinor, Math.max(0, owedMinor));
}

export function excessAdvancePreview(
  cashMinor: number,
  periodRemainingMinor: number,
  outstandingAdvanceMinor: number,
): number {
  const salaryCash = salaryCashPreview(
    cashMinor,
    periodRemainingMinor,
    outstandingAdvanceMinor,
  );
  return cashMinor - salaryCash;
}

export function payableClearedPreview(
  cashMinor: number,
  periodRemainingMinor: number,
  outstandingAdvanceMinor: number,
): number {
  const applied = advanceAppliedPreview(
    cashMinor,
    periodRemainingMinor,
    outstandingAdvanceMinor,
  );
  const salaryCash = salaryCashPreview(
    cashMinor,
    periodRemainingMinor,
    outstandingAdvanceMinor,
  );
  return salaryCash + applied;
}

export function defaultPeriodFromDate(isoDate: string): {
  year: number;
  month: number;
} {
  const [y, m] = isoDate.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year: y, month: m };
}
