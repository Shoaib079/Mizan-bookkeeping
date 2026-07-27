/** Salary payment advance + period preview (mirrors backend posting). */

/** Generic picker placeholder — not a real employee name. */
export const STAFF_SALARY_EMPLOYEE_PLACEHOLDER = "Employee";

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
};

export function advanceAppliedPreview(
  _cashMinor: number,
  _periodRemainingMinor: number,
  _outstandingAdvanceMinor: number,
): number {
  // Decoupled 2026-07-13 (BUGLOG): salary payments settle CASH ONLY — advances
  // are applied via the explicit "Apply advance" action on the staff page.
  return 0;
}

export function salaryCashPreview(
  cashMinor: number,
  periodRemainingMinor: number,
  outstandingAdvanceMinor: number,
): number {
  const applied = advanceAppliedPreview(
    cashMinor,
    periodRemainingMinor,
    outstandingAdvanceMinor,
  );
  return Math.min(cashMinor, Math.max(0, periodRemainingMinor - applied));
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
