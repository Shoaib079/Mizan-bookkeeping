"use client";

/** Owed / advance / net-to-pay preview for StaffSalaryPaymentDialog. */

import type { SalaryPeriodStatus } from "@/lib/staff-salary";

type Props = {
  status: SalaryPeriodStatus | null;
  loading: boolean;
  error: string | null;
  periodRemaining: number;
  outstandingAdvance: number;
  owedPreview: number;
  cashPreview: number;
  advancePreview: number;
  payablePreview: number;
  excessPreview: number;
  suggestedNet: number;
  settlePreviewActive: boolean;
  formatMinor: (minor: number) => string;
};

export function StaffSalarySettlePreview({
  status,
  loading,
  error,
  periodRemaining,
  outstandingAdvance,
  owedPreview,
  cashPreview,
  advancePreview,
  payablePreview,
  excessPreview,
  suggestedNet,
  settlePreviewActive,
  formatMinor,
}: Props) {
  return (
    <>
      {status && (
        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p>
            Salary owed:{" "}
            <span className="font-medium tabular-nums">
              {formatMinor(owedPreview)}
            </span>
            {periodRemaining !== owedPreview && (
              <span className="text-muted-foreground">
                {" "}
                (month remaining {formatMinor(periodRemaining)})
              </span>
            )}
          </p>
          {outstandingAdvance > 0 && (
            <p className="mt-1">
              Advance held:{" "}
              <span className="font-medium tabular-nums">
                {formatMinor(outstandingAdvance)}
              </span>
            </p>
          )}
          <p className="mt-1">
            Net to pay:{" "}
            <span className="font-medium tabular-nums">
              {formatMinor(suggestedNet)}
            </span>
          </p>
          {settlePreviewActive && payablePreview > 0 && (
            <p className="mt-2 text-muted-foreground">
              {cashPreview > 0 || advancePreview > 0 ? (
                <>
                  Pay{" "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMinor(cashPreview)}
                  </span>{" "}
                  cash
                  {advancePreview > 0 && (
                    <>
                      {" · use "}
                      <span className="font-medium tabular-nums text-foreground">
                        {formatMinor(advancePreview)}
                      </span>{" "}
                      advance
                    </>
                  )}
                  {" · clear "}
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMinor(payablePreview)}
                  </span>{" "}
                  salary
                </>
              ) : null}
            </p>
          )}
          {excessPreview > 0 && (
            <p className="mt-1 text-muted-foreground">
              Extra becomes advance:{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatMinor(excessPreview)}
              </span>
            </p>
          )}
          {status.period_paid_minor > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Already paid this month: {formatMinor(status.period_paid_minor)}
            </p>
          )}
        </div>
      )}
      {loading && (
        <p className="text-xs text-muted-foreground">Loading period…</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </>
  );
}
