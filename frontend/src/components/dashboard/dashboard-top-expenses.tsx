"use client";

/** Top 5 expense accounts this month — expense-register account_totals. */

import { useCallback, useEffect, useState } from "react";
import { Receipt } from "lucide-react";

import { StatCard } from "@/components/page/stat-card";
import { apiFetch } from "@/lib/api";
import { currentMonthRange } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";
import type { ExpenseRegisterRead } from "@/lib/report-types";

type Props = {
  /** When false, skip fetch (no financial reports grant). */
  enabled: boolean;
};

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

  return (
    <div
      data-testid="dashboard-top-expenses"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
    >
      {rows.map((row) => (
        <StatCard
          key={row.account_id}
          href="/reports/expense-register"
          label={row.account_name}
          caption={`${row.entry_count} entr${row.entry_count === 1 ? "y" : "ies"} · this month`}
          icon={Receipt}
          amountKurus={row.amount_kurus}
          iconTint="sand"
          iconStroke="amber"
        />
      ))}
    </div>
  );
}
