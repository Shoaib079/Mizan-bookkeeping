"use client";

/** Profit & loss report (Phase 9 Slice 8). */

import { Suspense, useCallback, useEffect, useState } from "react";

import { isForbiddenError } from "@/components/reports/forbidden-message";
import { ReportAccountRows } from "@/components/reports/report-account-rows";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { ReportDownloadMenu } from "@/components/reports/report-download-menu";
import { AppShell } from "@/components/layout/app-shell";
import { ReportPage } from "@/components/page/report-page";
import { StatCard } from "@/components/page/stat-card";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import type { ProfitAndLossRead, ReportSource } from "@/lib/report-types";
import { reportDownloadQuery } from "@/lib/report-download-query";
import { SealedPeriodBanner } from "@/components/reports/sealed-period-banner";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function ProfitAndLossContent() {
  const { entityId } = useEntity();
  const isMobile = useIsMobileShell();
  const { from, to, setRange, queryString } = useReportRangeFromUrl();
  const [report, setReport] = useState<ProfitAndLossRead | null>(null);
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
      const res = await apiFetch<ProfitAndLossRead>(
        `/entities/${entityId}/reports/profit-and-loss?${queryString}&view=${view}`,
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

  const revenue = report?.accounts.filter((a) => a.account_type === "revenue") ?? [];
  const expenses = report?.accounts.filter((a) => a.account_type === "expense") ?? [];

  return (
    <AppShell title="Profit & loss">
      <ReportPage
        title="Profit & loss"
        entityId={entityId}
        loading={loading}
        error={error}
        forbidden={forbidden}
        forbiddenContext="profit and loss"
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
            reportSlug="profit-and-loss"
            queryString={reportDownloadQuery(queryString, view)}
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
            <div className="grid gap-4 min-[820px]:grid-cols-3">
              <StatCard label="Revenue" amountKurus={report.total_revenue_kurus} />
              <StatCard
                label="Expenses"
                amountKurus={report.total_expenses_kurus}
                tone="bad"
              />
              <StatCard
                label="Net income"
                amountKurus={report.net_income_kurus}
                tone={report.net_income_kurus >= 0 ? "good" : "bad"}
              />
            </div>
          )
        }
      >
        {report && (
          <div className="space-y-6">
            {revenue.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold">Revenue</h2>
                <ReportAccountRows
                  rows={revenue}
                  amountHeader="Amount"
                  typeLabel="Revenue"
                  isMobile={isMobile}
                />
              </section>
            )}

            {expenses.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold">Expenses</h2>
                <ReportAccountRows
                  rows={expenses}
                  amountHeader="Amount"
                  typeLabel="Expense"
                  isMobile={isMobile}
                  forceOut
                />
              </section>
            )}
          </div>
        )}
      </ReportPage>
    </AppShell>
  );
}

export default function ProfitAndLossPage() {
  return (
    <Suspense>
      <ProfitAndLossContent />
    </Suspense>
  );
}
