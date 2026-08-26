"use client";

/** Period comparison report (Phase 9 Slice 8). */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { isForbiddenError } from "@/components/reports/forbidden-message";
import { PeriodComparisonMetricsTable } from "@/components/reports/period-comparison-tables";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { ReportDownloadMenu } from "@/components/reports/report-download-menu";
import { AppShell } from "@/components/layout/app-shell";
import { ReportPage } from "@/components/page/report-page";
import { apiFetch } from "@/lib/api";
import {
  PRIOR_PERIOD_MODES,
  priorPeriodFor,
  priorPeriodIsUsable,
  type PriorPeriodMode,
} from "@/lib/prior-period";
import { useEntity } from "@/lib/entity-context";
import { formatTrDate } from "@/lib/money";
import type { PeriodComparisonRead } from "@/lib/report-types";
import { useIsMobileShell } from "@/lib/use-mobile-shell";
import { useReportRangeFromUrl } from "@/lib/use-report-url";

function PeriodComparisonContent() {
  const { entityId } = useEntity();
  const isMobile = useIsMobileShell();
  const { from, to, setRange, queryString } = useReportRangeFromUrl();
  const [priorMode, setPriorMode] = useState<PriorPeriodMode>("auto");

  // `auto` sends nothing and lets the backend choose; every other mode sends an
  // explicit range through params the API has always accepted.
  const fullQuery = useMemo(() => {
    const prior = priorPeriodFor(priorMode, from, to);
    if (!prior) return queryString;
    const params = new URLSearchParams(queryString);
    params.set("prior_from", prior.from);
    params.set("prior_to", prior.to);
    return params.toString();
  }, [from, priorMode, queryString, to]);
  const [report, setReport] = useState<PeriodComparisonRead | null>(null);
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
      const res = await apiFetch<PeriodComparisonRead>(
        `/entities/${entityId}/reports/period-comparison?${fullQuery}`,
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
  }, [entityId, fullQuery]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <AppShell title="Period comparison">
      <ReportPage
        title="Period comparison"
        entityId={entityId}
        loading={loading}
        error={error}
        forbidden={forbidden}
        forbiddenContext="period comparison"
        hasReport={Boolean(report)}
        periodControl={
          <div className="flex flex-wrap items-end gap-4">
            <ReportDateRange
              from={from}
              to={to}
              disabled={!entityId || loading}
              onChange={setRange}
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Compare against</span>
              <select
                value={priorMode}
                disabled={!entityId || loading}
                onChange={(event) =>
                  setPriorMode(event.target.value as PriorPeriodMode)
                }
                className="h-9 rounded-md border border-border bg-background px-2 text-sm"
              >
                {PRIOR_PERIOD_MODES.map((mode) => (
                  <option
                    key={mode.id}
                    value={mode.id}
                    title={mode.hint}
                    disabled={!priorPeriodIsUsable(mode.id, from, to)}
                  >
                    {mode.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
        downloads={
          <ReportDownloadMenu
            entityId={entityId}
            reportSlug="period-comparison"
            queryString={fullQuery}
            disabled={forbidden || !report}
          />
        }
      >
        {report && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current: {formatTrDate(report.current_from)} –{" "}
              {formatTrDate(report.current_to)} · Prior:{" "}
              {formatTrDate(report.prior_from)} – {formatTrDate(report.prior_to)}
            </p>
            <PeriodComparisonMetricsTable
              metrics={report.metrics}
              isMobile={isMobile}
            />
          </div>
        )}
      </ReportPage>
    </AppShell>
  );
}

export default function PeriodComparisonPage() {
  return (
    <Suspense>
      <PeriodComparisonContent />
    </Suspense>
  );
}
