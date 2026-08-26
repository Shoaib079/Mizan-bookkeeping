"use client";

/** Top 5 expense accounts this month — horizontal bars from expense-register. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiFetch } from "@/lib/api";
import { currentMonthRange } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import type { ExpenseRegisterRead } from "@/lib/report-types";

type Props = {
  /** When false, skip fetch (no financial reports grant). */
  enabled: boolean;
};

/** Bar width as % of the largest row (0–100). */
export function expenseBarPercent(
  amountKurus: number,
  maxKurus: number,
): number {
  if (maxKurus <= 0 || amountKurus <= 0) return 0;
  return Math.min(100, Math.round((amountKurus / maxKurus) * 100));
}

export function DashboardTopExpenses({ enabled }: Props) {
  const { entityId } = useEntity();
  const [rows, setRows] = useState<
    ExpenseRegisterRead["account_totals"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId || !enabled) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    const { from, to } = currentMonthRange();
    try {
      const res = await apiFetch<ExpenseRegisterRead>(
        `/entities/${entityId}/reports/expense-register?from=${from}&to=${to}`,
      );
      setRows(res.account_totals.slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [entityId, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!enabled) return null;

  if (loading && rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="dashboard-top-expenses-loading">
        Loading top expenses…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="dashboard-top-expenses-error">
        {error}
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="dashboard-top-expenses-empty">
        No expenses posted this month yet.
      </p>
    );
  }

  const maxKurus = Math.max(...rows.map((row) => row.amount_kurus), 0);

  return (
    <div
      data-testid="dashboard-top-expenses"
      className="rounded-[var(--radius-card)] border border-border bg-card p-4"
    >
      <ul className="space-y-3">
        {rows.map((row) => {
          const pct = expenseBarPercent(row.amount_kurus, maxKurus);
          return (
            <li key={row.account_id} data-testid="dashboard-top-expense-row">
              <Link
                href="/reports/expense-register"
                className="block rounded-md outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {row.account_name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatTry(row.amount_kurus)}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
                  role="presentation"
                >
                  <div
                    data-testid="dashboard-top-expense-bar"
                    data-percent={pct}
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
