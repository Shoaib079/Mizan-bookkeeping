/** Salary payment advance + period preview (mirrors backend posting). */

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
  cashMinor: number,
  periodRemainingMinor: number,
  outstandingAdvanceMinor: number,
): number {
  if (outstandingAdvanceMinor <= 0 || periodRemainingMinor <= 0) return 0;
  const room = periodRemainingMinor - cashMinor;
  if (room <= 0) return 0;
  return Math.min(outstandingAdvanceMinor, room);
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
