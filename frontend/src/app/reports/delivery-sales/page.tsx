"use client";

/** Delivery sales report (Phase 9 Slice 8). */

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
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import type { DeliverySalesReportRead } from "@/lib/report-types";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function DeliverySalesContent() {
  const { entityId } = useEntity();
  const { from, to, setRange, queryString } = useReportRangeFromUrl();
  const [report, setReport] = useState<DeliverySalesReportRead | null>(null);
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
      const res = await apiFetch<DeliverySalesReportRead>(
        `/entities/${entityId}/reports/delivery-sales?${queryString}`,
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
    <AppShell title="Delivery sales">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <ReportDateRange
          from={from}
          to={to}
          disabled={!entityId || loading}
          onChange={setRange}
        />
        <ReportDownloadMenu
          entityId={entityId}
          reportSlug="delivery-sales"
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
      {loading && <PageSkeleton />}

      {report && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total gross</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatTry(report.total_gross_kurus)}
            </p>
          </div>

          {report.platforms.length > 0 ? (
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Platform</DataTableHeaderCell>
                  <DataTableHeaderCell>Status</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Gross</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Reports</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {report.platforms.map((row) => (
                  <DataTableRow key={row.delivery_platform_id}>
                    <DataTableCell>{row.platform_name}</DataTableCell>
                    <DataTableCell>
                      {row.is_active ? "Active" : "Inactive"}
                    </DataTableCell>
                    <DataTableCell align="right" className="tabular-nums">
                      {formatTry(row.gross_kurus)}
                    </DataTableCell>
                    <DataTableCell align="right" className="tabular-nums">
                      {row.report_count}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          ) : (
            <p className="text-sm text-muted-foreground">
              No posted delivery reports in this period.
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function DeliverySalesPage() {
  return (
    <Suspense>
      <DeliverySalesContent />
    </Suspense>
  );
}
