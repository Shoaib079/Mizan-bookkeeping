"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { shouldShowNetResultSummary } from "@/lib/entity-access";
import { formatFxNative } from "@/lib/fx-money";
import { formatTry } from "@/lib/money";
import type { DashboardRead } from "@/lib/report-types";
import type { EntityRole } from "@/lib/settings-types";
import { cn } from "@/lib/utils";

type Props = {
  summary: DashboardRead;
  role: EntityRole;
  refreshing?: boolean;
};

export function ReportsPeriodSummary({
  summary,
  role,
  refreshing = false,
}: Props) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-lg border border-border bg-card px-4 py-3 text-sm transition-opacity",
        refreshing && "opacity-70",
      )}
      aria-busy={refreshing}
    >
      <div className="flex flex-wrap gap-6">
        <div>
          <span className="text-muted-foreground">Sales · </span>
          <span className="font-medium tabular-nums">
            {formatTry(summary.sales.total_sales_kurus)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Expenses · </span>
          <span className="font-medium tabular-nums">
            {formatTry(summary.total_expenses_kurus)}
          </span>
        </div>
        {shouldShowNetResultSummary(role) && (
          <div>
            <span className="text-muted-foreground">Net · </span>
            <span className="font-medium tabular-nums">
              {formatTry(summary.net_result_kurus)}
            </span>
          </div>
        )}
      </div>
      {summary.fx_balances.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Foreign currency held
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {summary.fx_balances.map((fx) => (
              <li key={fx.money_account_id} className="min-w-0">
                <span className="text-muted-foreground">{fx.name} · </span>
                <span className="font-medium tabular-nums">
                  {formatFxNative(fx.native_quantity, fx.currency)}
                </span>
                <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                  (book {formatTry(fx.try_cost_kurus)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ReportsPeriodSummarySkeleton({
  showNet = true,
}: {
  showNet?: boolean;
}) {
  return (
    <div
      className="space-y-3 rounded-lg border border-border bg-card px-4 py-3 text-sm"
      aria-busy
      aria-label="Loading period summary"
    >
      <div className="flex flex-wrap gap-6">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-32" />
        {showNet && <Skeleton className="h-5 w-28" />}
      </div>
      <div className="border-t border-border pt-3">
        <Skeleton className="mb-2 h-4 w-36" />
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-5 w-40" />
        </div>
      </div>
    </div>
  );
}
