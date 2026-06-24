"use client";

/** Period comparison report (Phase 9 Slice 8). */

import { Suspense, useCallback, useEffect, useState } from "react";

import {
  ForbiddenMessage,
  isForbiddenError,
} from "@/components/reports/forbidden-message";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { ReportDownloadMenu } from "@/components/reports/report-download-menu";
import { AppShell } from "@/components/layout/app-shell";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
} from "@/components/ui/data-table";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate, formatTry } from "@/lib/money";
import type { PeriodComparisonRead } from "@/lib/report-types";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function formatChangePercent(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function PeriodComparisonContent() {
  const { entityId } = useEntity();
  const { from, to, setRange, queryString } = useReportRangeFromUrl();
  const [report, setReport] = useState<PeriodComparisonRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const reload = useCallback(async () => {
    if (!entityId) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const res = await apiFetch<PeriodComparisonRead>(
        `/entities/${entityId}/reports/period-comparison?${queryString}`,
      );
      setReport(res);
    } catch (err) {
      if (isForbiddenError(err)) {
        setForbidden(true);
        setReport(null);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load");
        setReport(null);
      }
    } finally {
      setLoading(false);
    }
  }, [entityId, queryString]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <AppShell title="Period comparison">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <ReportDateRange
          from={from}
          to={to}
          disabled={!entityId || loading}
          onChange={setRange}
        />
        <ReportDownloadMenu
          entityId={entityId}
          reportSlug="period-comparison"
          queryString={queryString}
          disabled={forbidden || !report}
        />
      </div>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}
      {forbidden && <ForbiddenMessage />}
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && (
        <p className="text-sm text-muted-foreground">Loading report…</p>
      )}

      {report && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current: {formatTrDate(report.current_from)} –{" "}
            {formatTrDate(report.current_to)} · Prior:{" "}
            {formatTrDate(report.prior_from)} – {formatTrDate(report.prior_to)}
          </p>

          <DataTable>
            <DataTableHead>
              <tr>
                <DataTableHeaderCell>Metric</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Current</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Prior</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Change</DataTableHeaderCell>
                <DataTableHeaderCell align="right">%</DataTableHeaderCell>
              </tr>
            </DataTableHead>
            <DataTableBody>
              {report.metrics.map((row) => (
                <DataTableRow key={row.key}>
                  <DataTableCell>{row.label}</DataTableCell>
                  <DataTableCell align="right" className="tabular-nums">
                    {formatTry(row.current_kurus)}
                  </DataTableCell>
                  <DataTableCell align="right" className="tabular-nums">
                    {formatTry(row.prior_kurus)}
                  </DataTableCell>
                  <DataTableCell align="right" className="tabular-nums">
                    {formatTry(row.change_kurus)}
                  </DataTableCell>
                  <DataTableCell align="right" className="tabular-nums">
                    {formatChangePercent(row.change_percent)}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        </div>
      )}
    </AppShell>
  );
}

export default function PeriodComparisonPage() {
  return (
    <Suspense>
      <PeriodComparisonContent />
    </Suspense>
  );
}
