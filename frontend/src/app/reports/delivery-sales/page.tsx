"use client";

/** Delivery sales report (Phase 9 Slice 8). */

import { Suspense, useCallback, useEffect, useState } from "react";

import { isForbiddenError } from "@/components/reports/forbidden-message";
import { DeliverySalesPlatformTable } from "@/components/reports/delivery-sales-tables";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { ReportDownloadMenu } from "@/components/reports/report-download-menu";
import { AppShell } from "@/components/layout/app-shell";
import { ReportPage } from "@/components/page/report-page";
import { StatCard } from "@/components/page/stat-card";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import type { DeliverySalesReportRead } from "@/lib/report-types";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function DeliverySalesContent() {
  const { entityId } = useEntity();
  const isMobile = useIsMobileShell();
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
      <ReportPage
        title="Delivery sales"
        entityId={entityId}
        loading={loading}
        error={error}
        forbidden={forbidden}
        forbiddenContext="delivery sales report"
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
            reportSlug="delivery-sales"
            queryString={queryString}
            disabled={forbidden || !report}
          />
        }
      >
        {report && (
          <div className="space-y-6">
            <StatCard
              label="Total gross"
              amountKurus={report.total_gross_kurus}
              className="sm:max-w-xs"
            />
            <DeliverySalesPlatformTable
              platforms={report.platforms}
              isMobile={isMobile}
            />
          </div>
        )}
      </ReportPage>
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
