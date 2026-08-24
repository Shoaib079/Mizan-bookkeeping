/** Settle preview numbers for staff salary payment UI. */

import {
  advanceAppliedPreview,
  excessAdvancePreview,
  netToPayMinor,
  payableClearedPreview,
  type SalaryPeriodStatus,
} from "@/lib/staff-salary";

export type StaffSalarySettlePreview = {
  periodRemaining: number;
  outstandingAdvance: number;
  owedPreview: number;
  cashPreview: number;
  settlePreviewActive: boolean;
  advancePreview: number;
  payablePreview: number;
  excessPreview: number;
  suggestedNet: number;
};

export function staffSalarySettlePreview(args: {
  status: SalaryPeriodStatus | null;
  extraDaysTotalMinor: number | null;
  cashMinor: number | null;
}): StaffSalarySettlePreview {
  const periodRemaining = args.status?.period_remaining_minor ?? 0;
  const outstandingAdvance = args.status?.outstanding_advance_minor ?? 0;
  const owedPreview =
    (args.status?.total_owed_minor ?? periodRemaining) +
    (args.extraDaysTotalMinor ?? 0);
  const cashPreview = args.cashMinor ?? 0;
  const settlePreviewActive =
    owedPreview > 0 || outstandingAdvance > 0 || cashPreview > 0;
  return {
    periodRemaining,
    outstandingAdvance,
    owedPreview,
    cashPreview,
    settlePreviewActive,
    advancePreview: settlePreviewActive
      ? advanceAppliedPreview(cashPreview, owedPreview, outstandingAdvance)
      : 0,
    payablePreview: settlePreviewActive
      ? payableClearedPreview(cashPreview, owedPreview, outstandingAdvance)
      : 0,
    excessPreview:
      cashPreview > 0 ? excessAdvancePreview(cashPreview, owedPreview) : 0,
    suggestedNet: netToPayMinor(owedPreview, outstandingAdvance),
  };
}
