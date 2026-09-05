"use client";

/** KDV input VAT report (Phase 9 Slice 8). */

import { Suspense, useCallback, useEffect, useState } from "react";

import { isForbiddenError } from "@/components/reports/forbidden-message";
import { KdvInputRateTable } from "@/components/reports/kdv-input-tables";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { ReportDownloadMenu } from "@/components/reports/report-download-menu";
import { AppShell } from "@/components/layout/app-shell";
import { ReportPage } from "@/components/page/report-page";
import { StatCard } from "@/components/page/stat-card";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import type { KdvInputReportRead } from "@/lib/report-types";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function KdvInputContent() {
  const { entityId } = useEntity();
  const isMobile = useIsMobileShell();
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
      <ReportPage
        title="KDV input"
        entityId={entityId}
        loading={loading}
        error={error}
        forbidden={forbidden}
        forbiddenContext="KDV report"
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
            reportSlug="kdv-input"
            queryString={queryString}
            disabled={forbidden || !report}
          />
        }
      >
        {report && (
          <div className="space-y-6">
            <div className="grid gap-4 min-[820px]:grid-cols-3">
              <StatCard label="Total base" amountKurus={report.total_base_kurus} />
              <StatCard label="Total VAT" amountKurus={report.total_vat_kurus} />
              <StatCard label="Invoices" value={String(report.invoice_count)} />
            </div>
            <KdvInputRateTable rates={report.rates} isMobile={isMobile} />
          </div>
        )}
      </ReportPage>
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
