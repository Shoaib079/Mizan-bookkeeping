"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { CorrectDailySalesForm } from "@/components/forms/correct-daily-sales-form";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { PosDailySalesPostedActions } from "@/components/sales/pos-daily-sales-posted-actions";
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
import { canExportFiles } from "@/lib/entity-access";
import { formatTrDate, formatTry } from "@/lib/money";
import { useEntityAccess } from "@/lib/use-entity-access";
import type { PosDailySummary } from "@/lib/pos-delivery-types";
import { isPendingReviewStatus } from "@/lib/review-status";
import {
  SALES_REVIEW_FILTERS,
  salesFilterUsesRange,
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
  const { grants } = useEntityAccess();
  const showExport = canExportFiles(grants);
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
  const [items, setItems] = useState<PosDailySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voidSummary, setVoidSummary] = useState<PosDailySummary | null>(null);
  const [correctSummary, setCorrectSummary] = useState<PosDailySummary | null>(
    null,
  );

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
        {showExport && (
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
        )}
        </>
      }
      toolbar={
        // Shown only where it applies. The queues ignore the range now, and a
        // date picker that changes nothing is worse than none — it looks like
        // the answer when a row seems missing, and it is never the reason.
        salesFilterUsesRange(review) ? (
          <ReportDateRange
            from={from}
            to={to}
            disabled={loading || exporting}
            onChange={setRange}
          />
        ) : undefined
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
        // "in this period" was true when every view was date-scoped. The
        // queues no longer are, and a count that names a period it does not
        // have is the same wrong label as "Period total" on the expenses page.
        loading
          ? "Loading…"
          : `${total} daily sale${total === 1 ? "" : "s"}` +
            (salesFilterUsesRange(review) ? " in this period" : "")
      }
      skeletonColumns={6}
      isEmpty={items.length === 0}
      empty={
        <EmptyState
          icon={ShoppingBag}
          title={
            salesFilterUsesRange(review) ? "No sales in this period" : "No sales"
          }
          hint={
            // Telling someone to change dates they cannot see sends them
            // looking for a control that is not on the screen — which is the
            // same wrong turn the date picker itself used to cause.
            salesFilterUsesRange(review)
              ? "Change the dates or filter, or upload sales via Record."
              : "Change the filter, or upload sales via Record."
          }
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
                    <PosDailySalesPostedActions
                      row={row}
                      grants={grants}
                      onCorrect={() => setCorrectSummary(row)}
                      onVoid={() => setVoidSummary(row)}
                    />
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
                  <div
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <PosDailySalesPostedActions
                      row={row}
                      grants={grants}
                      compact
                      onCorrect={() => setCorrectSummary(row)}
                      onVoid={() => setVoidSummary(row)}
                    />
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
