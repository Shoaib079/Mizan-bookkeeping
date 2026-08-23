"use client";

/** Dashboard — live KPIs from GET .../dashboard (Phase 9 Slice 8).
 * As-of balances on home; period analysis lives in Reports. */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { BalancesOverview } from "@/components/balances/balances-overview";
import { CashBankSnapshotCard } from "@/components/dashboard/cash-bank-snapshot-card";
import { DashboardV2Header } from "@/components/dashboard/dashboard-v2-header";

import {
  WeeklyChart,
  chartStatusForRefresh,
  type WeeklyChartStatus,
} from "@/components/dashboard/weekly-chart";
import { AppShell } from "@/components/layout/app-shell";
import { useNewLookTheme } from "@/components/layout/new-look-toggle";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { apiFetch } from "@/lib/api";
import { currentMonthRange } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import type { DashboardRead, TimeSeriesRead } from "@/lib/report-types";
import { useEntityAccess } from "@/lib/use-entity-access";
import {
  OverviewPage,
  OverviewSection,
} from "@/components/page/overview-page";
import { StatCard } from "@/components/page/stat-card";
import { Button } from "@/components/ui/button";
import { ThemeV2Only } from "@/components/ui/theme-v2-gate";
import { useQuickActions } from "@/components/quick-actions";

export default function HomePage() {
  return (
    <AppShell title="Dashboard">
      <DashboardBody />
    </AppShell>
  );
}

function DashboardBody() {
  const {
    entityId,
    entities,
    entitiesLoading,
    entitiesLoaded,
    entitiesError,
    refreshEntities,
    userProfile,
  } = useEntity();
  const { theme, mounted: themeMounted } = useNewLookTheme();
  const v2Dashboard = themeMounted && theme === "v2";
  const { deliveryEnabled } = useQuickActions();
  const { canReadFinancialReports } = useEntityAccess();
  const [data, setData] = useState<DashboardRead | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesRead | null>(null);
  const [timeSeriesStatus, setTimeSeriesStatus] =
    useState<WeeklyChartStatus>("loading");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) {
      setData(null);
      setTimeSeries(null);
      setTimeSeriesStatus("loading");
      return;
    }
    setLoading(true);
    setTimeSeriesStatus(chartStatusForRefresh);
    setError(null);

    const { from, to } = currentMonthRange();

    const tsFetch = (async () => {
      try {
        const tsRes = await apiFetch<TimeSeriesRead>(
          `/entities/${entityId}/reports/time-series?from=${from}&to=${to}`,
        );
        setTimeSeries(tsRes);
        setTimeSeriesStatus("loaded");
      } catch (err) {
        console.warn("Failed to load trend data:", err);
        setTimeSeries(null);
        setTimeSeriesStatus("error");
      }
    })();

    try {
      const dashRes = await apiFetch<DashboardRead>(
        `/entities/${entityId}/dashboard?from=${from}&to=${to}`,
      );
      setData(dashRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setData(null);
      await tsFetch;
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const deliveryBalanceLeftTotal = data?.delivery_balance_left.reduce(
    (sum, row) => sum + row.balance_left_kurus,
    0,
  );

  const noEntitySelected =
    !entityId && entitiesLoaded && !entitiesError && entities.length > 0;

  return (
    <OverviewPage
      title="Dashboard"
      loading={loading}
      error={error}
      replaceHeader={
        v2Dashboard ? (
          <ThemeV2Only>
            <DashboardV2Header displayName={userProfile?.display_name} />
          </ThemeV2Only>
        ) : undefined
      }
      banner={
        <>
          <OnboardingChecklist />
          {(entitiesLoading || (!entitiesLoaded && !entitiesError)) && (
            <p className="mb-4 text-sm text-muted-foreground">
              Loading restaurants…
            </p>
          )}
          {entitiesError && (
            <div className="mb-4">
              <p className="text-sm text-destructive">
                Could not load your restaurants. Check your connection and try
                again.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                onClick={() => void refreshEntities()}
              >
                Retry
              </Button>
            </div>
          )}
          {noEntitySelected && (
            <p className="mb-4 text-sm text-muted-foreground">
              Select a restaurant from the account menu to view the dashboard.
            </p>
          )}
        </>
      }
      stats={
        data && (
          <div
            data-testid="dashboard-kpi-row"
            data-layout="as-of-cash"
            className={
              canReadFinancialReports
                ? "grid gap-4"
                : "grid gap-4 lg:grid-cols-2"
            }
          >
            {canReadFinancialReports ? (
              <CashBankSnapshotCard
                cashKurus={data.cash_in_hand_kurus}
                bankKurus={data.bank_balance_kurus}
                cashAccounts={data.cash_accounts}
              />
            ) : (
              <>
                <StatCard
                  label="Sales"
                  amountKurus={data.sales.total_sales_kurus}
                />
                <StatCard
                  label="Expenses"
                  amountKurus={data.total_expenses_kurus}
                />
              </>
            )}
          </div>
        )
      }
    >
      {data && (
        <>
          {canReadFinancialReports && entityId && (
            <OverviewSection
              title="Right now"
              hint={
                "Payables, receivables, FX, staff, and partners — open a card for detail. Cash and bank are above."
              }
            >
              <BalancesOverview embedded />
            </OverviewSection>
          )}

          {data.delivery_balance_left.length > 0 && deliveryEnabled && (
            <OverviewSection
              title="Delivery balance left"
              controls={
                deliveryBalanceLeftTotal !== undefined && (
                  <span className="text-sm font-medium tabular-nums">
                    {formatTry(deliveryBalanceLeftTotal)}
                  </span>
                )
              }
            >
              <div className="rounded-lg border border-border bg-card p-4">
                <ul className="space-y-2 text-sm">
                  {data.delivery_balance_left.map((row) => (
                    <li
                      key={row.delivery_platform_id}
                      className="flex justify-between gap-2"
                    >
                      <span>{row.platform_name}</span>
                      <span className="tabular-nums">
                        {formatTry(row.balance_left_kurus)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  <Link href="/delivery" className="text-primary hover:underline">
                    Delivery hub
                  </Link>{" "}
                  for full reconciliation.
                </p>
              </div>
            </OverviewSection>
          )}

          {canReadFinancialReports && (
            <div className="mt-6">
              <WeeklyChart
                status={timeSeriesStatus}
                daily={timeSeries?.daily ?? []}
              />
            </div>
          )}

          {data.confirmed_invoice_drafts > 0 && (
            <OverviewSection title="Invoices ready to post">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm text-muted-foreground">
                  {data.confirmed_invoice_drafts} confirmed supplier invoice
                  {data.confirmed_invoice_drafts === 1 ? "" : "s"} waiting for
                  post-to-ledger — balances update only after posting.
                </p>
                <Link
                  href="/review/invoices"
                  className="mt-2 inline-block text-sm text-primary hover:underline"
                >
                  Open Review → Invoices
                </Link>
              </div>
            </OverviewSection>
          )}
        </>
      )}
    </OverviewPage>
  );
}
