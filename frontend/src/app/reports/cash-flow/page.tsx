"use client";

/** Cash flow report (Phase 9 Slice 8). */

import { Suspense, useCallback, useEffect, useState } from "react";

import { isForbiddenError } from "@/components/reports/forbidden-message";
import {
  CashFlowByCategory,
  CashFlowBySource,
} from "@/components/reports/cash-flow-tables";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { ReportDownloadMenu } from "@/components/reports/report-download-menu";
import { AppShell } from "@/components/layout/app-shell";
import { ReportPage } from "@/components/page/report-page";
import { StatCard } from "@/components/page/stat-card";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import type { CashFlowRead } from "@/lib/report-types";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function CashFlowContent() {
  const { entityId } = useEntity();
  const isMobile = useIsMobileShell();
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
            <div className="grid gap-4 min-[820px]:grid-cols-3">
              <StatCard label="Opening cash" amountKurus={report.opening_cash_kurus} />
              <StatCard label="Net change" amountKurus={report.net_change_kurus} />
              <StatCard label="Closing cash" amountKurus={report.closing_cash_kurus} />
            </div>

            <CashFlowByCategory
              operating={report.operating}
              investing={report.investing}
              financing={report.financing}
              isMobile={isMobile}
            />
            <CashFlowBySource rows={report.by_source} isMobile={isMobile} />

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
