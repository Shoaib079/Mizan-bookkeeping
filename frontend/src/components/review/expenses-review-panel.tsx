"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  CorrectExpenseForm,
  type CorrectableExpenseRow,
} from "@/components/forms/correct-expense-form";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { ReportDateRange } from "@/components/reports/report-date-range";
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
import {
  EXPENSE_REVIEW_FILTERS,
  useExpensesReviewUrl,
} from "@/lib/use-expenses-review-url";
import { cn } from "@/lib/utils";

type PaginatedResponse<T> = {
  items: T[];
  total: number;
  total_amount_kurus: number;
  limit: number;
  offset: number;
};

export function ExpensesReviewPanel() {
  const { entityId } = useEntity();
  const {
    from,
    to,
    filter,
    offset,
    pageSize,
    setRange,
    setFilter,
    setOffset,
    listQuery,
  } = useExpensesReviewUrl();
  const [items, setItems] = useState<CorrectableExpenseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmountKurus, setTotalAmountKurus] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [correctExpense, setCorrectExpense] =
    useState<CorrectableExpenseRow | null>(null);
  const [voidTarget, setVoidTarget] = useState<{
    expense_id: string;
    description: string;
  } | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      setTotal(0);
      setTotalAmountKurus(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PaginatedResponse<CorrectableExpenseRow>>(
        `/entities/${entityId}/expenses?${listQuery}`,
      );
      setItems(res.items);
      setTotal(res.total);
      setTotalAmountKurus(res.total_amount_kurus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses");
      setItems([]);
      setTotal(0);
      setTotalAmountKurus(0);
    } finally {
      setLoading(false);
    }
  }, [entityId, listQuery]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function onSaved() {
    invalidateReviewCounts();
    void reload();
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + pageSize, total);
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;
  const filterLabel =
    filter === "all"
      ? ""
      : ` (${EXPENSE_REVIEW_FILTERS.find((t) => t.id === filter)?.label ?? filter})`;

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

      <div className="mb-4 space-y-3">
        <ReportDateRange
          from={from}
          to={to}
          disabled={loading}
          onChange={setRange}
        />

        <div className="flex flex-wrap gap-1">
          {EXPENSE_REVIEW_FILTERS.map((tab) => (
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

        <p className="text-sm text-muted-foreground">
          {loading ? (
            "Loading…"
          ) : (
            <>
              {total} expense{total === 1 ? "" : "s"} in this period
              {filterLabel}
              {total > 0 && (
                <>
                  {" "}
                  · total{" "}
                  <span className="tabular-nums font-medium text-foreground">
                    {formatTry(totalAmountKurus)}
                  </span>
                </>
              )}
              {total > pageSize && (
                <>
                  {" "}
                  · showing {pageStart}–{pageEnd}
                </>
              )}
            </>
          )}
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={5} />}

      {!loading && items.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="No expenses in this view"
          hint="Change the dates or filter, or record a manual expense from Add."
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
                    <SubledgerRowActions
                      row={{
                        display_kind: "effective",
                        journal_entry_id: row.journal_entry_id,
                      }}
                      onEdit={() => setCorrectExpense(row)}
                      onVoid={() =>
                        setVoidTarget({
                          expense_id: row.id,
                          description:
                            row.written_item_description || row.description,
                        })
                      }
                    />
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

      {!loading && total > pageSize && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Page {Math.floor(offset / pageSize) + 1} of{" "}
            {Math.ceil(total / pageSize)}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!canPrev}
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!canNext}
              onClick={() => setOffset(offset + pageSize)}
            >
              Next
            </Button>
          </div>
        </div>
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

      <VoidSubledgerDialog
        open={voidTarget !== null}
        title="Void expense"
        description={voidTarget?.description}
        voidPath={
          entityId && voidTarget
            ? `/entities/${entityId}/expenses/${voidTarget.expense_id}/void`
            : null
        }
        onClose={() => setVoidTarget(null)}
        onSaved={onSaved}
      />
    </>
  );
}
