"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";

import { CorrectDailySalesForm } from "@/components/forms/correct-daily-sales-form";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { FilterChips } from "@/components/page/filter-chips";
import { ListPage } from "@/components/page/list-page";
import {
  SalesPeriodChips,
  SalesPostedKpiCards,
} from "@/components/sales/sales-period-chips";
import {
  SalesReviewMobileList,
  SalesReviewTable,
} from "@/components/sales/sales-review-table";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "@/components/ui/download-icon";
import { EmptyState } from "@/components/ui/empty-state";
import {
  apiDownload,
  ApiError,
  apiFetch,
  triggerBlobDownload,
} from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { canExportFiles } from "@/lib/entity-access";
import type { PosDailySummary } from "@/lib/pos-delivery-types";
import type { SalesSummaryRead } from "@/lib/sales-period-chips";
import { useEntityAccess } from "@/lib/use-entity-access";
import {
  SALES_REVIEW_FILTERS,
  salesFilterUsesRange,
  useSalesReviewUrl,
  type SalesReviewFilter,
} from "@/lib/use-sales-review-url";

type PaginatedResponse<T> = { items: T[]; total: number };

type Props = {
  defaultFilter?: SalesReviewFilter;
  showCreate?: boolean;
  title?: string;
};

export function SalesReviewPanel({
  defaultFilter = "all",
  showCreate = false,
  title = "Sales activity",
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
  } = useSalesReviewUrl(defaultFilter);
  const postedRange = salesFilterUsesRange(review);
  const [createOpen, setCreateOpen] = useState(false);
  const [items, setItems] = useState<PosDailySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [periodTotals, setPeriodTotals] = useState<SalesSummaryRead | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voidSummary, setVoidSummary] = useState<PosDailySummary | null>(null);
  const [correctSummary, setCorrectSummary] = useState<PosDailySummary | null>(
    null,
  );

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

  const reload = useCallback(async () => {
    if (!entityId) {
      setItems([]);
      setTotal(0);
      setPeriodTotals(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const listPromise = apiFetch<PaginatedResponse<PosDailySummary>>(
        `/entities/${entityId}/pos/daily-summaries?${listQuery}`,
      );
      const summaryPromise = postedRange
        ? apiFetch<SalesSummaryRead>(
            `/entities/${entityId}/reports/sales-summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          )
        : Promise.resolve(null);
      const [res, summary] = await Promise.all([listPromise, summaryPromise]);
      setItems(res.items);
      setTotal(res.total);
      setPeriodTotals(summary);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("You do not have access to sales for this restaurant.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load sales");
      }
      setItems([]);
      setTotal(0);
      setPeriodTotals(null);
    } finally {
      setLoading(false);
    }
  }, [entityId, from, listQuery, postedRange, to]);

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

  const cashTotal = periodTotals?.current.cash_kurus ?? 0;
  const cardTotal = periodTotals?.current.card_kurus ?? 0;
  const salesTotal = periodTotals?.current.total_kurus ?? 0;

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
              <DownloadIcon className="size-4" />
              {exporting ? "Downloading…" : "Download Excel"}
            </Button>
          )}
        </>
      }
      summary={
        postedRange && periodTotals ? (
          <SalesPostedKpiCards
            cashKurus={cashTotal}
            cardKurus={cardTotal}
            totalKurus={salesTotal}
          />
        ) : undefined
      }
      filters={
        <div className="flex w-full flex-col gap-2">
          <FilterChips
            chips={SALES_REVIEW_FILTERS}
            value={review}
            onChange={setReview}
            ariaLabel="Filter daily sales"
          />
          {postedRange && (
            <SalesPeriodChips
              from={from}
              to={to}
              disabled={loading || exporting}
              onChange={setRange}
            />
          )}
        </div>
      }
      countLabel={
        loading
          ? "Loading…"
          : `${total} daily sale${total === 1 ? "" : "s"}` +
            (postedRange ? " in this period" : "")
      }
      skeletonColumns={6}
      isEmpty={items.length === 0}
      empty={
        <EmptyState
          icon={ShoppingBag}
          title={postedRange ? "No sales in this period" : "No sales"}
          hint={
            postedRange
              ? "Change the dates or filter, or upload sales via Record."
              : "Change the filter, or upload sales via Record."
          }
        />
      }
      table={
        <SalesReviewTable
          items={items}
          grants={grants}
          showPeriodTotals={Boolean(postedRange && periodTotals)}
          cashTotal={cashTotal}
          cardTotal={cardTotal}
          salesTotal={salesTotal}
          onCorrect={setCorrectSummary}
          onVoid={setVoidSummary}
        />
      }
      mobile={
        <SalesReviewMobileList
          items={items}
          grants={grants}
          onCorrect={setCorrectSummary}
          onVoid={setVoidSummary}
        />
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
