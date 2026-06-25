"use client";

/** Balance sheet report (Phase 9 Slice 8). */

import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useState } from "react";

import {
  ForbiddenMessage,
  isForbiddenError,
} from "@/components/reports/forbidden-message";
import { ReportAsOfDate } from "@/components/reports/report-as-of-date";
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
import type { BalanceSheetRead } from "@/lib/report-types";
import { useReportAsOfFromUrl } from "@/lib/use-report-url";

function BalanceSheetContent() {
  const { entityId } = useEntity();
  const { asOf, setAsOf, queryString } = useReportAsOfFromUrl();
  const [report, setReport] = useState<BalanceSheetRead | null>(null);
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
      const res = await apiFetch<BalanceSheetRead>(
        `/entities/${entityId}/reports/balance-sheet?${queryString}`,
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
    <AppShell title="Balance sheet">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <ReportAsOfDate
          asOf={asOf}
          disabled={!entityId || loading}
          onChange={setAsOf}
        />
        <ReportDownloadMenu
          entityId={entityId}
          reportSlug="balance-sheet"
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
              { label: "Assets", value: report.total_assets_kurus },
              { label: "Liabilities", value: report.total_liabilities_kurus },
              { label: "Equity", value: report.total_equity_kurus },
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

          {!report.accounting_equation_balanced && (
            <p className="text-sm text-destructive">
              Accounting equation check failed — contact support.
            </p>
          )}

          <SectionTable title="Assets" subtotal={report.assets.subtotal_kurus} rows={report.assets.accounts} />
          <SectionTable title="Liabilities" subtotal={report.liabilities.subtotal_kurus} rows={report.liabilities.accounts} />
          <SectionTable
            title="Equity"
            subtotal={report.equity.subtotal_kurus}
            rows={report.equity.accounts}
            extra={
              report.equity.unclosed_net_income_kurus !== 0 ? (
                <DataTableRow>
                  <DataTableCell className="font-mono text-xs">—</DataTableCell>
                  <DataTableCell>Unclosed net income</DataTableCell>
                  <DataTableCell align="right" className="tabular-nums">
                    {formatTry(report.equity.unclosed_net_income_kurus)}
                  </DataTableCell>
                </DataTableRow>
              ) : null
            }
          />

          <p className="text-sm text-muted-foreground">
            Liabilities + equity:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatTry(report.total_liabilities_and_equity_kurus)}
            </span>
          </p>
        </div>
      )}
    </AppShell>
  );
}

function SectionTable({
  title,
  subtotal,
  rows,
  extra,
}: {
  title: string;
  subtotal: number;
  rows: BalanceSheetRead["assets"]["accounts"];
  extra?: ReactNode;
}) {
  if (rows.length === 0 && !extra) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <DataTable>
        <DataTableHead>
          <tr>
            <DataTableHeaderCell>Code</DataTableHeaderCell>
            <DataTableHeaderCell>Account</DataTableHeaderCell>
            <DataTableHeaderCell align="right">Balance</DataTableHeaderCell>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((row) => (
            <DataTableRow key={row.account_id}>
              <DataTableCell className="font-mono text-xs">{row.code}</DataTableCell>
              <DataTableCell>{row.name_en}</DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {formatTry(row.balance_kurus)}
              </DataTableCell>
            </DataTableRow>
          ))}
          {extra}
        </DataTableBody>
      </DataTable>
      <p className="mt-2 text-sm text-muted-foreground">
        Subtotal:{" "}
        <span className="font-medium tabular-nums text-foreground">
          {formatTry(subtotal)}
        </span>
      </p>
    </section>
  );
}

export default function BalanceSheetPage() {
  return (
    <Suspense>
      <BalanceSheetContent />
    </Suspense>
  );
}
