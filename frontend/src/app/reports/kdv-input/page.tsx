"use client";

/** KDV input VAT report (Phase 9 Slice 8). */

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
import { formatTry } from "@/lib/money";
import type { KdvInputReportRead } from "@/lib/report-types";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function KdvInputContent() {
  const { entityId } = useEntity();
  const { from, to, setRange, queryString } = useReportRangeFromUrl();
  const [report, setReport] = useState<KdvInputReportRead | null>(null);
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
      const res = await apiFetch<KdvInputReportRead>(
        `/entities/${entityId}/reports/kdv-input?${queryString}`,
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
    <AppShell title="KDV input">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <ReportDateRange
          from={from}
          to={to}
          disabled={!entityId || loading}
          onChange={setRange}
        />
        <ReportDownloadMenu
          entityId={entityId}
          reportSlug="kdv-input"
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
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Total base", value: report.total_base_kurus },
              { label: "Total VAT", value: report.total_vat_kurus },
              { label: "Invoices", value: report.invoice_count, money: false },
            ].map((row) => (
              <div
                key={row.label}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="text-sm text-muted-foreground">{row.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {"money" in row && row.money === false
                    ? row.value
                    : formatTry(row.value as number)}
                </p>
              </div>
            ))}
          </div>

          {report.rates.length > 0 ? (
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Rate</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Base</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">VAT</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Invoices</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {report.rates.map((row) => (
                  <DataTableRow key={row.rate_percent}>
                    <DataTableCell className="tabular-nums">
                      %{row.rate_percent}
                    </DataTableCell>
                    <DataTableCell align="right" className="tabular-nums">
                      {formatTry(row.base_kurus)}
                    </DataTableCell>
                    <DataTableCell align="right" className="tabular-nums">
                      {formatTry(row.vat_kurus)}
                    </DataTableCell>
                    <DataTableCell align="right" className="tabular-nums">
                      {row.invoice_count}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          ) : (
            <p className="text-sm text-muted-foreground">
              No posted purchase invoices in this period.
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function KdvInputPage() {
  return (
    <Suspense>
      <KdvInputContent />
    </Suspense>
  );
}
