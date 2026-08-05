"use client";

import Link from "next/link";

/** Balance sheet report (Phase 9 Slice 8). */

import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useState } from "react";

import { isForbiddenError } from "@/components/reports/forbidden-message";
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
import { ReportPage } from "@/components/page/report-page";
import { StatCard } from "@/components/page/stat-card";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";

/** Chart code for retained earnings — mirrors the backend default chart. */
const RETAINED_EARNINGS_CODE = "3100";
import type { BalanceSheetRead, ReportSource } from "@/lib/report-types";
import { SealedPeriodBanner } from "@/components/reports/sealed-period-banner";
import { useReportAsOfFromUrl } from "@/lib/use-report-url";

function BalanceSheetContent() {
  const { entityId } = useEntity();
  const { asOf, setAsOf, queryString } = useReportAsOfFromUrl();
  const [report, setReport] = useState<BalanceSheetRead | null>(null);
  const [view, setView] = useState<ReportSource>("as_closed");
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
        `/entities/${entityId}/reports/balance-sheet?${queryString}&view=${view}`,
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
  }, [entityId, queryString, view]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Allocating profit debits retained earnings (Dr 3100 / Cr 3300). Do that
  // before the year is closed and the profit is still sitting in unclosed net
  // income, so retained earnings goes negative by the allocated amount even
  // though equity as a whole is unchanged — it is a transfer within equity.
  // Correct, but it reads like a mistake, so the page says so rather than
  // leaving the owner (or their accountant) to work it out.
  const retained = report?.equity.accounts.find(
    (row) => row.code === RETAINED_EARNINGS_CODE,
  );
  const retainedEarningsNote =
    retained &&
    retained.balance_kurus < 0 &&
    (report?.equity.unclosed_net_income_kurus ?? 0) > 0
      ? "Retained earnings is negative because profit has been allocated to partners while this year's result is still in Unclosed net income. Equity as a whole is unaffected — the allocation moves money from retained earnings to partner capital. It resolves at year-end close."
      : undefined;

  return (
    <AppShell title="Balance sheet">
      <ReportPage
        title="Balance sheet"
        entityId={entityId}
        loading={loading}
        error={error}
        forbidden={forbidden}
        forbiddenContext="balance sheet"
        hasReport={Boolean(report)}
        meta={
          <>
            Starting figures come from{" "}
            <Link
              href="/onboarding/opening-balances"
              className="text-primary hover:underline"
            >
              Opening balances
            </Link>{" "}
            (Settings).
          </>
        }
        periodControl={
          <ReportAsOfDate
            asOf={asOf}
            disabled={!entityId || loading}
            onChange={setAsOf}
          />
        }
        downloads={
          <ReportDownloadMenu
            entityId={entityId}
            reportSlug="balance-sheet"
            queryString={queryString}
            pdf
            disabled={forbidden || !report}
          />
        }
        banner={
          report && (
            <SealedPeriodBanner
              source={report.source}
              sealed={report.sealed}
              view={view}
              onViewChange={setView}
            />
          )
        }
        kpis={
          report && (
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Assets" amountKurus={report.total_assets_kurus} />
              <StatCard
                label="Liabilities"
                amountKurus={report.total_liabilities_kurus}
              />
              <StatCard
                label="Equity"
                amountKurus={
                  report.total_equity_kurus +
                  report.equity.unclosed_net_income_kurus
                }
                caption="Including the result not yet closed to equity"
              />
            </div>
          )
        }
      >
        {report && (
          <div className="space-y-6">
          {!report.accounting_equation_balanced && (
            <p className="text-sm text-destructive">
              Accounting equation check failed — contact support.
            </p>
          )}

          <SectionTable title="Assets" subtotal={report.assets.subtotal_kurus} rows={report.assets.accounts} />
          <SectionTable title="Liabilities" subtotal={report.liabilities.subtotal_kurus} rows={report.liabilities.accounts} />
          <SectionTable
            title="Equity"
            subtotal={
              report.equity.subtotal_kurus +
              report.equity.unclosed_net_income_kurus
            }
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
            note={retainedEarningsNote}
          />

          <p className="text-sm text-muted-foreground">
            Liabilities + equity:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {formatTry(report.total_liabilities_and_equity_kurus)}
            </span>
          </p>
          </div>
        )}
      </ReportPage>
    </AppShell>
  );
}

function SectionTable({
  title,
  subtotal,
  rows,
  extra,
  note,
}: {
  title: string;
  subtotal: number;
  rows: BalanceSheetRead["assets"]["accounts"];
  extra?: ReactNode;
  /** Explains a figure that reads oddly but is correct. */
  note?: ReactNode;
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
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
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
