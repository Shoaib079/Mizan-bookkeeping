"use client";

import { ExpensesReviewExportMenu } from "@/components/review/expenses-review-export-menu";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { formatTry } from "@/lib/money";
import {
  expenseFilterUsesRange,
  type ExpenseReviewFilter,
  type ExpenseReviewView,
} from "@/lib/use-expenses-review-url";

/** Date range + Excel export + period total — split from expenses-review-panel (S9). */
export function ExpensesReviewRangeBar({
  entityId,
  from,
  to,
  filter,
  view,
  listQuery,
  loading,
  itemsLoading,
  periodTotalLabel,
  periodTotalKurus,
  onRangeChange,
}: {
  entityId: string | null;
  from: string;
  to: string;
  filter: ExpenseReviewFilter;
  view: ExpenseReviewView;
  listQuery: string;
  loading: boolean;
  itemsLoading: boolean;
  periodTotalLabel: string;
  periodTotalKurus: number;
  onRangeChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      {/* Shown only where it applies — see `expenseFilterUsesRange`. The
          queues ignore the range, and a picker that changes nothing is
          the first thing reached for when a row seems missing. */}
      {expenseFilterUsesRange(filter) ? (
        <ReportDateRange
          from={from}
          to={to}
          disabled={loading && view === "expenses"}
          onChange={onRangeChange}
        />
      ) : (
        <div />
      )}
      <div className="flex flex-wrap items-end gap-3">
        {view === "expenses" && expenseFilterUsesRange(filter) && (
          <ExpensesReviewExportMenu
            entityId={entityId}
            listQuery={listQuery}
            disabled={loading}
          />
        )}
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{periodTotalLabel}</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight">
            {(view === "expenses" && loading) ||
            (view === "items" && itemsLoading)
              ? "…"
              : formatTry(periodTotalKurus)}
          </p>
        </div>
      </div>
    </div>
  );
}
