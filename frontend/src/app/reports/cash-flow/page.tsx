"use client";

/** Cash flow report (Phase 9 Slice 8). */

import { Suspense, useCallback, useEffect, useState } from "react";

import { isForbiddenError } from "@/components/reports/forbidden-message";
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
import { ReportPage } from "@/components/page/report-page";
import { StatCard } from "@/components/page/stat-card";
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
      <ReportPage
        title="Cash flow"
        entityId={entityId}
        loading={loading}
        error={error}
        forbidden={forbidden}
        forbiddenContext="cash flow report"
        hasReport={Boolean(report)}
        periodControl={
          <ReportDateRange
            from={from}
            to={to}
            disabled={!entityId || loading}
            onChange={setRange}
          />
        }
        downloads={
          <ReportDownloadMenu
            entityId={entityId}
            reportSlug="cash-flow"
            queryString={queryString}
            pdf
            disabled={forbidden || !report}
          />
        }
      >

      {report && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Opening cash" amountKurus={report.opening_cash_kurus} />
            <StatCard label="Net change" amountKurus={report.net_change_kurus} />
            <StatCard label="Closing cash" amountKurus={report.closing_cash_kurus} />
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
      </ReportPage>
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
