"use client";

/** Dashboard — live KPIs from GET .../dashboard (Phase 9 Slice 8). */

import Link from "next/link";
import { ShoppingBag, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useQuickActions } from "@/components/quick-actions";
import { RecentEntriesCard } from "@/components/dashboard/recent-entries-card";
import { ReportDateRange } from "@/components/reports/report-date-range";
import { AppShell } from "@/components/layout/app-shell";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { currentMonthRange } from "@/lib/date-range";
import {
  filterDashboardKpis,
  shouldShowWriteChrome,
  type DashboardKpi,
} from "@/lib/entity-access";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative } from "@/lib/fx-money";
import { formatTry } from "@/lib/money";
import type { DashboardRead } from "@/lib/report-types";
import { useEntityAccess } from "@/lib/use-entity-access";
import { reviewHrefForNeedsReviewKey } from "@/lib/review-routes";
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
  const { openQuickAction, deliveryEnabled } = useQuickActions();
  const { role, canReadFinancialReports } = useEntityAccess();
  const showWriteChrome = shouldShowWriteChrome(role);
  const [range, setRange] = useState(currentMonthRange);
  const [data, setData] = useState<DashboardRead | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!entityId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DashboardRead>(
        `/entities/${entityId}/dashboard?from=${range.from}&to=${range.to}`,
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [entityId, range.from, range.to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const kpis: DashboardKpi[] = data
    ? filterDashboardKpis(
        [
          { key: "sales", label: "Sales", value: formatTry(data.sales.total_sales_kurus) },
          {
            key: "expenses",
            label: "Expenses",
            value: formatTry(data.total_expenses_kurus),
          },
          {
            key: "net_result",
            label: "Net result",
            value: formatTry(data.net_result_kurus),
          },
          {
            key: "payables",
            label: "Payables",
            value: formatTry(data.total_payables_kurus),
          },
          {
            key: "receivables",
            label: "Receivables",
            value: formatTry(data.total_receivables_kurus),
          },
          {
            key: "try_position",
            label: "TRY position",
            value: formatTry(data.total_try_position_kurus),
          },
          {
            key: "needs_review",
            label: "Needs review",
            value: String(data.needs_review.total),
          },
        ],
        role,
      )
    : [];

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
            <Link
              href="/close-day"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
            >
              <ShoppingBag className="size-4" />
              Close day
            </Link>
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <div
                key={kpi.key}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

          {data.fx_balances.length > 0 && (
            <section className="mt-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">FX wallets</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {data.fx_balances.map((row) => (
                  <li
                    key={row.money_account_id}
                    className="flex justify-between gap-2"
                  >
                    <Link
                      href={`/banking/fx/${row.money_account_id}`}
                      className="text-primary hover:underline"
                    >
                      {row.name} ({row.currency})
                    </Link>
                    <div className="text-right">
                      <p className="tabular-nums">
                        {formatFxNative(row.native_quantity, row.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Book cost: {formatTry(row.try_cost_kurus)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {entityId && <RecentEntriesCard entityId={entityId} className="mt-6" />}

          {data.sales.total_sales_kurus > 0 && (
            <section className="mt-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Sales breakdown</h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Cash</dt>
                  <dd className="tabular-nums">
                    {formatTry(data.sales.cash_sales_kurus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">POS card</dt>
                  <dd className="tabular-nums">
                    {formatTry(data.sales.pos_card_sales_kurus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className="tabular-nums">
                    {formatTry(data.sales.delivery_sales_kurus)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Other</dt>
                  <dd className="tabular-nums">
                    {formatTry(data.sales.other_sales_kurus)}
                  </dd>
                </div>
              </dl>
            </section>
          )}

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

          {data.needs_review.total > 0 && (
            <section className="mt-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Needs review</h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {data.needs_review.invoice_drafts > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Invoice drafts</dt>
                    <dd className="tabular-nums">
                      <Link
                        href={reviewHrefForNeedsReviewKey("invoice_drafts")}
                        className="text-primary hover:underline"
                      >
                        {data.needs_review.invoice_drafts}
                      </Link>
                    </dd>
                  </div>
                )}
                {data.needs_review.bank_statement_lines > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Bank lines</dt>
                    <dd className="tabular-nums">
                      <Link
                        href={reviewHrefForNeedsReviewKey("bank_statement_lines")}
                        className="text-primary hover:underline"
                      >
                        {data.needs_review.bank_statement_lines}
                      </Link>
                    </dd>
                  </div>
                )}
                {data.needs_review.pos_daily_summaries > 0 && (
                  <div>
                    <dt className="text-muted-foreground">POS summaries</dt>
                    <dd className="tabular-nums">
                      <Link
                        href={reviewHrefForNeedsReviewKey("pos_daily_summaries")}
                        className="text-primary hover:underline"
                      >
                        {data.needs_review.pos_daily_summaries}
                      </Link>
                    </dd>
                  </div>
                )}
                {data.needs_review.delivery_reports > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Monthly sales</dt>
                    <dd className="tabular-nums">
                      <Link
                        href={reviewHrefForNeedsReviewKey("delivery_reports")}
                        className="text-primary hover:underline"
                      >
                        {data.needs_review.delivery_reports}
                      </Link>
                    </dd>
                  </div>
                )}
                {data.needs_review.expense_entries > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Expenses</dt>
                    <dd className="tabular-nums">
                      <Link
                        href={reviewHrefForNeedsReviewKey("expense_entries")}
                        className="text-primary hover:underline"
                      >
                        {data.needs_review.expense_entries}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
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

          {data.payables_preview.length > 0 && canReadFinancialReports && (
            <section className="mt-6 rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Top payables</h2>
                <Link
                  href="/balances/suppliers"
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </Link>
              </div>
              <ul className="space-y-2 text-sm">
                {data.payables_preview.map((row) => (
                  <li key={row.supplier_id} className="flex justify-between gap-2">
                    <Link
                      href={`/suppliers/${row.supplier_id}`}
                      className="text-primary hover:underline"
                    >
                      {row.supplier_name}
                    </Link>
                    <span className="tabular-nums">
                      {formatTry(row.balance_kurus)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
