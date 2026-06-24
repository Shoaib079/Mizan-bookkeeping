"use client";

/** Cash flow report (Phase 9 Slice 8). */

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
import type { CashFlowRead } from "@/lib/report-types";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function CashFlowContent() {
  const { entityId } = useEntity();
  const { from, to, setRange, queryString } = useReportRangeFromUrl();
  const [report, setReport] = useState<CashFlowRead | null>(null);
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
      const res = await apiFetch<CashFlowRead>(
        `/entities/${entityId}/reports/cash-flow?${queryString}`,
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
    <AppShell title="Cash flow">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <ReportDateRange
          from={from}
          to={to}
          disabled={!entityId || loading}
          onChange={setRange}
        />
        <ReportDownloadMenu
          entityId={entityId}
          reportSlug="cash-flow"
          queryString={queryString}
          pdf
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
              { label: "Opening cash", value: report.opening_cash_kurus },
              { label: "Net change", value: report.net_change_kurus },
              { label: "Closing cash", value: report.closing_cash_kurus },
            ].map((row) => (
              <div
                key={row.label}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="text-sm text-muted-foreground">{row.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {formatTry(row.value)}
                </p>
              </div>
            ))}
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold">By category</h2>
            <DataTable>
              <DataTableHead>
                <tr>
                  <DataTableHeaderCell>Category</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Inflows</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Outflows</DataTableHeaderCell>
                  <DataTableHeaderCell align="right">Net</DataTableHeaderCell>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {(
                  [
                    ["Operating", report.operating],
                    ["Investing", report.investing],
                    ["Financing", report.financing],
                  ] as const
                ).map(([label, cat]) => (
                  <DataTableRow key={label}>
                    <DataTableCell>{label}</DataTableCell>
                    <DataTableCell align="right" className="tabular-nums">
                      {formatTry(cat.inflows_kurus)}
                    </DataTableCell>
                    <DataTableCell align="right" className="tabular-nums">
                      {formatTry(cat.outflows_kurus)}
                    </DataTableCell>
                    <DataTableCell align="right" className="tabular-nums">
                      {formatTry(cat.net_kurus)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </section>

          {report.by_source.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">By source</h2>
              <DataTable>
                <DataTableHead>
                  <tr>
                    <DataTableHeaderCell>Source</DataTableHeaderCell>
                    <DataTableHeaderCell>Category</DataTableHeaderCell>
                    <DataTableHeaderCell align="right">Net cash</DataTableHeaderCell>
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {report.by_source.map((row) => (
                    <DataTableRow key={`${row.source}-${row.category}`}>
                      <DataTableCell>{row.source}</DataTableCell>
                      <DataTableCell className="capitalize">
                        {row.category}
                      </DataTableCell>
                      <DataTableCell align="right" className="tabular-nums">
                        {formatTry(row.net_cash_kurus)}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </section>
          )}

          {!report.reconciled_to_categories && (
            <p className="text-sm text-destructive">
              Category totals do not reconcile to net change.
            </p>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function CashFlowPage() {
  return (
    <Suspense>
      <CashFlowContent />
    </Suspense>
  );
}
