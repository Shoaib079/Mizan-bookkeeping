"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { CorrectDailySalesForm } from "@/components/forms/correct-daily-sales-form";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { VoidTriggerButton } from "@/components/ledger/void-trigger-button";
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
import { FilterChips } from "@/components/page/filter-chips";
import { ListPage } from "@/components/page/list-page";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileCardList, MobileCardRow } from "@/components/ui/mobile-card-list";
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
  type SalesReviewFilter,
} from "@/lib/use-sales-review-url";

type PaginatedResponse<T> = { items: T[]; total: number };

type Props = {
  /** M1: /sales defaults to "all", /review/sales to "pending". */
  defaultFilter?: SalesReviewFilter;
  /** M3: /sales owns creation — "New daily sales" button + ?new=1 deep link. */
  showCreate?: boolean;
  /** The page's own name — /sales and /review/sales share this panel. */
  title?: string;
};

export function SalesReviewPanel({
  defaultFilter = "all",
  showCreate = false,
  title = "Daily sales",
}: Props) {
  const { entityId } = useEntity();
  const {
    from,
    to,
    review,
    setRange,
    setReview,
    listQuery,
    exportQuery,
    offset,
    setOffset,
    pageSize,
  } =
    useSalesReviewUrl(defaultFilter);
  const [createOpen, setCreateOpen] = useState(false);

  // ?new=1 (Record hub deep link) opens the form once, then cleans the URL.
  useEffect(() => {
    if (!showCreate) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("new")) {
      setCreateOpen(true);
      params.delete("new");
      const query = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}`,
      );
    }
  }, [showCreate]);
  const entityTrackerRef = useRef(createEntitySwitchTracker());
  const [items, setItems] = useState<PosDailySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voidSummary, setVoidSummary] = useState<PosDailySummary | null>(null);
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
    <ListPage
      title={title}
      loading={loading}
      error={error}
      primaryAction={
        showCreate ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            New daily sales
          </Button>
        ) : undefined
      }
      actions={
        <>
          {showCreate && (
            <Link href="/record">
              <Button type="button" variant="secondary">
                Upload via Record
              </Button>
            </Link>
          )}
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
        </>
      }
      toolbar={
        <ReportDateRange
          from={from}
          to={to}
          disabled={loading || exporting}
          onChange={setRange}
        />
      }
      filters={
        <FilterChips
          chips={SALES_REVIEW_FILTERS}
          value={review}
          onChange={setReview}
          ariaLabel="Filter daily sales"
        />
      }
      countLabel={
        loading
          ? "Loading…"
          : `${total} daily sale${total === 1 ? "" : "s"} in this period`
      }
      skeletonColumns={6}
      isEmpty={items.length === 0}
      empty={
        <EmptyState
          icon={ShoppingBag}
          title="No sales in this period"
          hint="Change the dates or filter, or upload sales via Record."
        />
      }
      table={
        <DataTable wide>
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
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-8 px-3 text-xs"
                        onClick={() => setCorrectSummary(row)}
                      >
                        Edit
                      </Button>
                      <VoidTriggerButton onContinue={() => setVoidSummary(row)} />
                    </div>
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
      }
      mobile={
        <MobileCardList>
          {items.map((row) => (
            <MobileCardRow
              key={row.id}
              href={
                isPendingReviewStatus(row.status)
                  ? `/sales/${row.id}`
                  : `/sales/${row.id}`
              }
              title={row.summary_date ? formatTrDate(row.summary_date) : "—"}
              meta={<StatusBadge status={row.status} />}
              amount={formatTry(row.total_kurus)}
              trailing={
                row.status === "posted" ? (
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 px-2 text-xs"
                      onClick={(e) => {
                        e.preventDefault();
                        setCorrectSummary(row);
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                ) : isPendingReviewStatus(row.status) ? (
                  <span className="text-xs text-primary">Review</span>
                ) : null
              }
            />
          ))}
        </MobileCardList>
      }
      pager={{ offset, pageSize, total, onOffsetChange: setOffset }}
    >
      {showCreate && (
        <ManualDailySalesForm
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSaved={() => void reload()}
        />
      )}

      <CorrectDailySalesForm
        open={correctSummary !== null}
        summary={correctSummary}
        onClose={() => setCorrectSummary(null)}
        onSaved={() => void reload()}
      />

      <VoidSubledgerDialog
        open={voidSummary !== null}
        title="Void daily sales"
        description={
          voidSummary?.summary_date
            ? `Daily sales ${voidSummary.summary_date}`
            : voidSummary?.id
        }
        voidPath={
          entityId && voidSummary
            ? `/entities/${entityId}/pos/daily-summaries/${voidSummary.id}/void`
            : null
        }
        onClose={() => setVoidSummary(null)}
        onSaved={() => {
          setVoidSummary(null);
          void reload();
        }}
      />
    </ListPage>
  );
}
