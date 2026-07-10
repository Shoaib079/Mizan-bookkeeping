"use client";

/** Dashboard — live KPIs from GET .../dashboard (Phase 9 Slice 8). */

import Link from "next/link";
import { ArrowRightLeft, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useQuickActions } from "@/components/quick-actions";
import {
  WeeklyChart,
  type WeeklyChartStatus,
} from "@/components/dashboard/weekly-chart";
import { RecentEntriesCard } from "@/components/dashboard/recent-entries-card";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { AppShell } from "@/components/layout/app-shell";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { currentMonthRange } from "@/lib/date-range";
import { shouldShowWriteChrome } from "@/lib/entity-access";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative } from "@/lib/fx-money";
import { formatTry } from "@/lib/money";
import type { DashboardRead, TimeSeriesRead } from "@/lib/report-types";
import { useEntityAccess } from "@/lib/use-entity-access";
import { Button } from "@/components/ui/button";

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
  } = useEntity();
  const { openQuickAction, openRecordAction, deliveryEnabled } = useQuickActions();
  const { role, canReadFinancialReports } = useEntityAccess();
  const showWriteChrome = shouldShowWriteChrome(role);
  const [range, setRange] = useState(currentMonthRange);
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
    setTimeSeriesStatus("loading");
    setError(null);

    const tsFetch = (async () => {
      try {
        const tsRes = await apiFetch<TimeSeriesRead>(
          `/entities/${entityId}/reports/time-series?from=${range.from}&to=${range.to}`,
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
        `/entities/${entityId}/dashboard?from=${range.from}&to=${range.to}`,
      );
      setData(dashRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setData(null);
      setTimeSeries(null);
      setTimeSeriesStatus("loading");
      await tsFetch;
    } finally {
      setLoading(false);
    }
  }, [entityId, range.from, range.to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const deliveryBalanceLeftTotal = data?.delivery_balance_left.reduce(
    (sum, row) => sum + row.balance_left_kurus,
    0,
  );

  return (
    <>
      <OnboardingChecklist />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <ReportDateRange
          from={range.from}
          to={range.to}
          disabled={!entityId || loading}
          onChange={(from, to) => setRange({ from, to })}
        />
        {entityId && showWriteChrome && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              onClick={() => openQuickAction("sales")}
            >
              <ShoppingBag className="size-4" />
              Daily sales
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              onClick={() => openQuickAction("expense")}
            >
              <Wallet className="size-4" />
              Add expense
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              onClick={() => openRecordAction("closeDay")}
            >
              <ShoppingBag className="size-4" />
              Close day
            </Button>
          </div>
        )}
      </div>

      {(entitiesLoading || (!entitiesLoaded && !entitiesError)) && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Loading restaurants…</p>
        </div>
      )}

      {entitiesError && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-destructive">
            Could not load your restaurants. Check your connection and try again.
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

      {!entityId &&
        entitiesLoaded &&
        !entitiesError &&
        entities.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Select a restaurant from the account menu to view the dashboard.
          </p>
        </div>
      )}

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

      {data && (
        <>
          {canReadFinancialReports ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {/* This period — profit is the headline */}
              <Link
                href="/reports"
                className="block rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <TrendingUp className="size-4" /> This period
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Net result</p>
                <p
                  className={`mt-0.5 text-2xl font-semibold tabular-nums ${
                    data.net_result_kurus >= 0
                      ? "text-success"
                      : "text-destructive"
                  }`}
                >
                  {formatTry(data.net_result_kurus)}
                </p>
                <div className="mt-3 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">Sales</span>
                    <span className="tabular-nums">
                      {formatTry(data.sales.total_sales_kurus)}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">Expenses</span>
                    <span className="tabular-nums text-destructive">
                      {formatTry(data.total_expenses_kurus)}
                    </span>
                  </div>
                </div>
              </Link>

              {/* Money on hand — liquidity in one place */}
              <Link
                href="/banking"
                className="block rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Wallet className="size-4" /> Money on hand
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Cash + bank</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                  {formatTry(data.cash_in_hand_kurus + data.bank_balance_kurus)}
                </p>
                <div className="mt-3 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">Cash in hand</span>
                    <span className="tabular-nums">
                      {formatTry(data.cash_in_hand_kurus)}
                    </span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">Bank</span>
                    <span className="tabular-nums">
                      {formatTry(data.bank_balance_kurus)}
                    </span>
                  </div>
                  {data.fx_balances.length > 0 && (
                    <div className="flex justify-between gap-2 py-0.5 text-muted-foreground">
                      <span>FX wallets</span>
                      <span className="truncate tabular-nums">
                        {data.fx_balances
                          .map((r) => formatFxNative(r.native_quantity, r.currency))
                          .join(" · ")}
                      </span>
                    </div>
                  )}
                </div>
              </Link>

              {/* Owed — in vs out at a glance */}
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowRightLeft className="size-4" /> Owed
                </div>
                <div className="mt-3 flex items-stretch gap-2">
                  <Link
                    href="/receivables"
                    className="flex-1 rounded-lg p-2 transition-colors hover:bg-muted/40"
                  >
                    <p className="text-xs text-muted-foreground">They owe you</p>
                    <p className="whitespace-nowrap text-lg font-semibold tabular-nums text-success">
                      {formatTry(data.total_receivables_kurus)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Receivables
                    </p>
                  </Link>
                  <div className="w-px self-stretch bg-border" />
                  <Link
                    href="/suppliers"
                    className="flex-1 rounded-lg p-2 transition-colors hover:bg-muted/40"
                  >
                    <p className="text-xs text-muted-foreground">You owe</p>
                    <p className="whitespace-nowrap text-lg font-semibold tabular-nums text-destructive">
                      {formatTry(Math.abs(data.total_payables_kurus))}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Payables</p>
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">Sales</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatTry(data.sales.total_sales_kurus)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm text-muted-foreground">Expenses</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {formatTry(data.total_expenses_kurus)}
                </p>
              </div>
            </div>
          )}

          {canReadFinancialReports && (
            <div className="mt-6">
              <WeeklyChart
                status={timeSeriesStatus}
                daily={timeSeries?.daily ?? []}
              />
            </div>
          )}

          {entityId && <RecentEntriesCard entityId={entityId} className="mt-6" />}

          {data.confirmed_invoice_drafts > 0 && (
            <section className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
              <h2 className="text-sm font-semibold">Invoices ready to post</h2>
              <p className="mt-1 text-sm text-muted-foreground">
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
            </section>
          )}


          {data.delivery_balance_left.length > 0 && deliveryEnabled && (
            <section className="mt-6 rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Delivery balance left</h2>
                {deliveryBalanceLeftTotal !== undefined && (
                  <span className="text-sm font-medium tabular-nums">
                    {formatTry(deliveryBalanceLeftTotal)}
                  </span>
                )}
              </div>
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
            </section>
          )}

        </>
      )}
    </>
  );
}
