"use client";

/** Dashboard body — sales, cash & bank, balances, top expenses. */

import { useCallback, useEffect, useState } from "react";

import { BalancesOverview } from "@/components/balances/balances-overview";
import { CashBankSnapshotCard } from "@/components/dashboard/cash-bank-snapshot-card";
import { DashboardMonthlySales } from "@/components/dashboard/dashboard-monthly-sales";
import { DashboardTopExpenses } from "@/components/dashboard/dashboard-top-expenses";
import { DashboardV2Header } from "@/components/dashboard/dashboard-v2-header";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import {
  OverviewPage,
  OverviewSection,
} from "@/components/page/overview-page";
import { StatCard } from "@/components/page/stat-card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { currentMonthRange } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";
import { priorPeriodFor } from "@/lib/prior-period";
import type { DashboardRead } from "@/lib/report-types";
import { useEntityAccess } from "@/lib/use-entity-access";

export function DashboardHomeContent() {
  const {
    entityId,
    entities,
    entitiesLoading,
    entitiesLoaded,
    entitiesError,
    refreshEntities,
    userProfile,
  } = useEntity();
  const { canReadFinancialReports } = useEntityAccess();
  const [data, setData] = useState<DashboardRead | null>(null);
  const [priorSales, setPriorSales] = useState<DashboardRead["sales"] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) {
      setData(null);
      setPriorSales(null);
      return;
    }
    setLoading(true);
    setError(null);

    const { from, to } = currentMonthRange();
    const prior = priorPeriodFor("last-month", from, to);

    try {
      const dashRes = await apiFetch<DashboardRead>(
        `/entities/${entityId}/dashboard?from=${from}&to=${to}`,
      );
      setData(dashRes);

      if (prior && canReadFinancialReports) {
        try {
          const priorRes = await apiFetch<DashboardRead>(
            `/entities/${entityId}/dashboard?from=${prior.from}&to=${prior.to}`,
          );
          setPriorSales(priorRes.sales);
        } catch {
          setPriorSales(null);
        }
      } else {
        setPriorSales(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setData(null);
      setPriorSales(null);
    } finally {
      setLoading(false);
    }
  }, [entityId, canReadFinancialReports]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const noEntitySelected =
    !entityId && entitiesLoaded && !entitiesError && entities.length > 0;

  return (
    <OverviewPage
      title="Dashboard"
      loading={loading}
      error={error}
      replaceHeader={
        <DashboardV2Header displayName={userProfile?.display_name} />
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
        data &&
        !canReadFinancialReports && (
          <div
            data-testid="dashboard-kpi-row"
            data-layout="as-of-cash"
            className="grid gap-4 sm:grid-cols-2"
          >
            <StatCard
              label="Sales"
              amountKurus={data.sales.total_sales_kurus}
            />
            <StatCard
              label="Expenses"
              amountKurus={data.total_expenses_kurus}
            />
          </div>
        )
      }
    >
      {data && canReadFinancialReports && (
        <>
          <OverviewSection
            title="Sales this month"
            hint="Cash, card, and total versus the same dates last month."
          >
            <DashboardMonthlySales
              current={data.sales}
              prior={priorSales}
            />
          </OverviewSection>

          <div
            data-testid="dashboard-kpi-row"
            data-layout="as-of-cash"
            className="mt-6 grid gap-4"
          >
            <CashBankSnapshotCard
              cashKurus={data.cash_in_hand_kurus}
              bankKurus={data.bank_balance_kurus}
              cashAccounts={data.cash_accounts}
              interactive={false}
            />
          </div>

          {entityId && (
            <OverviewSection
              title="Balances"
              hint="Payables, receivables, FX, staff, and partners — open a line for detail."
            >
              <BalancesOverview embedded compact />
            </OverviewSection>
          )}

          <OverviewSection
            title="Top expenses"
            hint="Largest expense accounts this month."
          >
            <DashboardTopExpenses enabled={canReadFinancialReports} />
          </OverviewSection>
        </>
      )}
    </OverviewPage>
  );
}
