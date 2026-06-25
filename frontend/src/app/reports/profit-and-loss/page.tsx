"use client";

/** Profit & loss report (Phase 9 Slice 8). */

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
import type { ProfitAndLossRead } from "@/lib/report-types";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function ProfitAndLossContent() {
  const { entityId } = useEntity();
  const { from, to, setRange, queryString } = useReportRangeFromUrl();
  const [report, setReport] = useState<ProfitAndLossRead | null>(null);
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
      const res = await apiFetch<ProfitAndLossRead>(
        `/entities/${entityId}/reports/profit-and-loss?${queryString}`,
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

  const revenue = report?.accounts.filter((a) => a.account_type === "revenue") ?? [];
  const expenses = report?.accounts.filter((a) => a.account_type === "expense") ?? [];

  return (
    <AppShell title="Profit & loss">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <ReportDateRange
          from={from}
          to={to}
          disabled={!entityId || loading}
          onChange={setRange}
        />
        <ReportDownloadMenu
          entityId={entityId}
          reportSlug="profit-and-loss"
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
      {loading && <PageSkeleton />}

      {report && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Revenue", value: report.total_revenue_kurus },
              { label: "Expenses", value: report.total_expenses_kurus },
              { label: "Net income", value: report.net_income_kurus },
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

          {revenue.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Revenue</h2>
              <AccountTable rows={revenue} />
            </section>
          )}

          {expenses.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">Expenses</h2>
              <AccountTable rows={expenses} />
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}

function AccountTable({
  rows,
}: {
  rows: ProfitAndLossRead["accounts"];
}) {
  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <DataTableHeaderCell>Code</DataTableHeaderCell>
          <DataTableHeaderCell>Account</DataTableHeaderCell>
          <DataTableHeaderCell align="right">Amount</DataTableHeaderCell>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((row) => (
          <DataTableRow key={row.account_id}>
            <DataTableCell className="font-mono text-xs">{row.code}</DataTableCell>
            <DataTableCell>{row.name_en}</DataTableCell>
            <DataTableCell align="right" className="tabular-nums">
              {formatTry(row.amount_kurus)}
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

export default function ProfitAndLossPage() {
  return (
    <Suspense>
      <ProfitAndLossContent />
    </Suspense>
  );
}
