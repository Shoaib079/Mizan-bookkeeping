"use client";

/** Cash / card / delivery totals on /sales — selected period vs full prior month.
 *
 * Read-only. Period comparison stays same-length; this block always uses a
 * full calendar prior month (owner: mid-month wants last month WHOLE). */

import { Download } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ReportDateRange } from "@/components/reports/report-date-range";
import { FilterChips } from "@/components/page/filter-chips";
import { Button } from "@/components/ui/button";
import {
  apiDownload,
  ApiError,
  apiFetch,
  triggerBlobDownload,
} from "@/lib/api";
import { buildRangeQuery } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";
import { canExportFiles } from "@/lib/entity-access";
import { formatTry } from "@/lib/money";
import type { SalesSummaryColumnRead, SalesSummaryRead } from "@/lib/sales-summary-range";
import {
  rangeForSalesSummaryChip,
  salesSummaryColumnCaption,
  SALES_SUMMARY_CHIPS,
  type SalesSummaryChip,
} from "@/lib/sales-summary-range";
import { useEntityAccess } from "@/lib/use-entity-access";

type Props = {
  /** Injectable clock for tests (chip defaults). */
  now?: Date;
};

export function SalesSummaryBlock({ now }: Props) {
  const { entityId } = useEntity();
  const { grants } = useEntityAccess();
  const showExport = canExportFiles(grants);
  const reference = now ?? new Date();

  const [chip, setChip] = useState<SalesSummaryChip>("this-month");
  const [range, setRange] = useState(() =>
    rangeForSalesSummaryChip("this-month", reference)!,
  );
  const [data, setData] = useState<SalesSummaryRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = buildRangeQuery(range.from, range.to);

  const reload = useCallback(async () => {
    if (!entityId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<SalesSummaryRead>(
        `/entities/${entityId}/reports/sales-summary?${query}`,
      );
      setData(res);
    } catch (err) {
      setData(null);
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not load sales summary",
      );
    } finally {
      setLoading(false);
    }
  }, [entityId, query]);

  useEffect(() => {
    void reload();
  }, [reload]);

  function onChip(next: SalesSummaryChip) {
    setChip(next);
    const nextRange = rangeForSalesSummaryChip(next, reference);
    if (nextRange) setRange(nextRange);
  }

  async function onExport() {
    if (!entityId) return;
    setExporting(true);
    setError(null);
    try {
      const { blob, filename } = await apiDownload(
        `/entities/${entityId}/reports/sales-summary/export?${query}`,
      );
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (!entityId) return null;

  return (
    <section
      data-testid="sales-summary-block"
      className="rounded-lg border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[#0B1526]">Sales summary</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Posted cash, card
            {data?.delivery_enabled ? ", and delivery" : ""} totals — selected
            period vs the full month before it.
          </p>
        </div>
        {showExport && (
          <Button
            type="button"
            variant="secondary"
            disabled={loading || exporting || !data}
            className="gap-1.5"
            onClick={() => void onExport()}
          >
            <Download className="size-4" />
            {exporting ? "Downloading…" : "Download Excel"}
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <FilterChips
          chips={SALES_SUMMARY_CHIPS}
          value={chip}
          onChange={onChip}
          ariaLabel="Sales summary period"
        />
        {chip === "custom" && (
          <ReportDateRange
            from={range.from}
            to={range.to}
            disabled={loading || exporting}
            onChange={(from, to) => setRange({ from, to })}
          />
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {loading && !data && (
        <p className="mt-3 text-sm text-muted-foreground">Loading summary…</p>
      )}

      {data && (
        <div
          data-testid="sales-summary-columns"
          className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-6"
        >
          <SummaryColumn
            testId="sales-summary-current"
            label="Selected period"
            column={data.current}
            showDelivery={data.delivery_enabled}
          />
          <SummaryColumn
            testId="sales-summary-prior"
            label="Prior month"
            column={data.prior}
            showDelivery={data.delivery_enabled}
          />
        </div>
      )}
    </section>
  );
}

function SummaryColumn({
  testId,
  label,
  column,
  showDelivery,
}: {
  testId: string;
  label: string;
  column: SalesSummaryColumnRead;
  showDelivery: boolean;
}) {
  const caption = salesSummaryColumnCaption(
    column.from_date,
    column.to_date,
    column.full_month,
  );

  return (
    <div
      data-testid={testId}
      className="min-w-0 rounded-md border border-border/80 bg-background/40 p-3 sm:p-4"
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        data-testid={`${testId}-caption`}
        className="mt-0.5 text-[11px] tabular-nums text-muted-foreground"
      >
        {caption}
      </p>
      <dl className="mt-3 space-y-2">
        <MetricRow label="Cash" value={column.cash_kurus} />
        <MetricRow label="Card" value={column.card_kurus} />
        {showDelivery && (
          <MetricRow label="Delivery" value={column.delivery_kurus} />
        )}
        <MetricRow label="Total" value={column.total_kurus} emphasize />
      </dl>
    </div>
  );
}

function MetricRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={
          emphasize
            ? "text-sm font-semibold text-[#0B1526]"
            : "text-sm text-muted-foreground"
        }
      >
        {label}
      </dt>
      <dd
        className={
          emphasize
            ? "text-base font-bold tabular-nums text-[#0B1526]"
            : "text-sm font-bold tabular-nums text-[#0B1526]"
        }
      >
        {formatTry(value)}
      </dd>
    </div>
  );
}
