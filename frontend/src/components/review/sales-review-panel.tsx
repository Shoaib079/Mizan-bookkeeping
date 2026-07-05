"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { CorrectDailySalesForm } from "@/components/forms/correct-daily-sales-form";
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
import { ShoppingBag } from "lucide-react";
import {
  apiDownload,
  ApiError,
  apiFetch,
  triggerBlobDownload,
} from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import type { PosDailySummary } from "@/lib/pos-delivery-types";
import { isPendingReviewStatus } from "@/lib/review-status";
import { createEntitySwitchTracker } from "@/lib/use-entity-reset";
import {
  SALES_REVIEW_FILTERS,
  useSalesReviewUrl,
} from "@/lib/use-sales-review-url";
import { cn } from "@/lib/utils";

type PaginatedResponse<T> = { items: T[]; total: number };

export function SalesReviewPanel() {
  const { entityId } = useEntity();
  const { from, to, review, setRange, setReview, listQuery, exportQuery } =
    useSalesReviewUrl();
  const entityTrackerRef = useRef(createEntitySwitchTracker());
  const [items, setItems] = useState<PosDailySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctSummary, setCorrectSummary] = useState<PosDailySummary | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!entityTrackerRef.current.sync(entityId)) return;
    setItems([]);
    setTotal(0);
    setError(null);
    setLoading(Boolean(entityId));
  }, [entityId]);

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
      const res = await apiFetch<PaginatedResponse<PosDailySummary>>(
        `/entities/${entityId}/pos/daily-summaries?${listQuery}`,
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("You do not have access to sales for this restaurant.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load sales");
      }
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [entityId, listQuery]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onExport() {
    if (!entityId) return;
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await apiDownload(
        `/entities/${entityId}/pos/daily-summaries/export?${exportQuery}`,
      );
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
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
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <ReportDateRange
            from={from}
            to={to}
            disabled={loading || exporting}
            onChange={setRange}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={loading || exporting || total === 0}
            className="gap-1.5"
            onClick={() => void onExport()}
          >
            <Download className="size-4" />
            {exporting ? "Downloading…" : "Download Excel"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1">
          {SALES_REVIEW_FILTERS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                review === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
              onClick={() => setReview(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : `${total} daily sale${total === 1 ? "" : "s"} in this period`}
          {total > items.length && !loading
            ? ` (showing ${items.length} — download Excel for the full list)`
            : null}
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <TableSkeleton columns={6} />}

      {!loading && items.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No sales in this period"
          hint="Change the dates or filter, or upload sales via Record."
        />
      ) : null}

      {!loading && items.length > 0 && (
        <DataTable>
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Date</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Cash</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Card</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Total</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell align="right">Actions</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {items.map((row) => (
              <DataTableRow key={row.id}>
                <DataTableCell>
                  {isPendingReviewStatus(row.status) ? (
                    <Link
                      href={`/sales/${row.id}`}
                      className="text-primary hover:underline"
                    >
                      {row.summary_date ? formatTrDate(row.summary_date) : "—"}
                    </Link>
                  ) : (
                    (row.summary_date ? formatTrDate(row.summary_date) : "—")
                  )}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.cash_kurus)}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.card_kurus)}
                </DataTableCell>
                <DataTableCell align="right">
                  {formatTry(row.total_kurus)}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={row.status} />
                  {row.review_reason && isPendingReviewStatus(row.status) && (
                    <p className="mt-1 max-w-xs truncate text-xs text-warning">
                      {row.review_reason}
                    </p>
                  )}
                </DataTableCell>
                <DataTableCell align="right">
                  {row.status === "posted" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => setCorrectSummary(row)}
                    >
                      Correct
                    </Button>
                  ) : isPendingReviewStatus(row.status) ? (
                    <Link
                      href={`/sales/${row.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Review
                    </Link>
                  ) : null}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <CorrectDailySalesForm
        open={correctSummary !== null}
        summary={correctSummary}
        onClose={() => setCorrectSummary(null)}
        onSaved={() => void reload()}
      />
    </>
  );
}
