"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  CorrectExpenseForm,
  type CorrectableExpenseRow,
} from "@/components/forms/correct-expense-form";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Wallet } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import { invalidateReviewCounts } from "@/lib/review-counts-types";
import { isPendingReviewStatus } from "@/lib/review-status";
import { REVIEW_TAB_HREFS } from "@/lib/review-routes";
import { cn } from "@/lib/utils";

type ExpenseFilter = "all" | "needs_review" | "posted";

const EXPENSE_FILTERS: { id: ExpenseFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_review", label: "Needs review" },
  { id: "posted", label: "Posted" },
];

type PaginatedResponse<T> = { items: T[]; total: number };

export function ExpensesReviewPanel() {
  const { entityId } = useEntity();
  const [filter, setFilter] = useState<ExpenseFilter>("all");
  const [items, setItems] = useState<CorrectableExpenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [correctExpense, setCorrectExpense] =
    useState<CorrectableExpenseRow | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const statusQuery =
        filter === "all" ? "" : `&status=${filter}`;
      const res = await apiFetch<PaginatedResponse<CorrectableExpenseRow>>(
        `/entities/${entityId}/expenses?limit=50${statusQuery}`,
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [entityId, filter]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function onSaved() {
    invalidateReviewCounts();
    void reload();
  }

  if (!entityId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a restaurant in the sidebar.
      </p>
    );
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Cash and bank outflows posted as expenses — correct mistakes here.
          Receipt photos are in{" "}
          <Link
            href={REVIEW_TAB_HREFS.receipts}
            className="text-primary hover:underline"
          >
            Receipts
          </Link>
          ; salary is under Staff.
        </p>
        <Button type="button" onClick={() => setRecordOpen(true)}>
          Record expense
        </Button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {EXPENSE_FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-sm",
              filter === tab.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        {loading
          ? "Loading…"
          : `${total} expense${total === 1 ? "" : "s"}${
              filter === "all" ? "" : ` (${EXPENSE_FILTERS.find((t) => t.id === filter)?.label ?? filter})`
            }`}
      </p>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={5} />}

      {!loading && items.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No expenses in this view"
          hint="Record a manual expense or upload a receipt photo from Add."
        />
      )}

      {!loading && items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell>Description</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>{formatTrDate(row.expense_date)}</DataTableCell>
                <DataTableCell>
                  {row.written_item_description || row.description}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.amount_kurus)}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.status} />
                </DataTableCell>
                <DataTableCell align="right">
                  {row.status === "posted" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => setCorrectExpense(row)}
                    >
                      Correct
                    </Button>
                  ) : isPendingReviewStatus(row.status) ? (
                    <span className="text-xs text-muted-foreground">
                      Confirm via Add
                    </span>
                  ) : null}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <ManualExpenseForm
        open={recordOpen}
        showRecordKindToggle={false}
        onClose={() => setRecordOpen(false)}
        onSaved={onSaved}
      />

      <CorrectExpenseForm
        open={correctExpense !== null}
        expense={correctExpense}
        onClose={() => setCorrectExpense(null)}
        onSaved={onSaved}
      />
    </>
  );
}
