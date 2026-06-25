"use client";

/** Dashboard — live KPIs from GET .../dashboard (Phase 9 Slice 8). */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { ReportDateRange } from "@/components/reports/report-date-range";
import { AppShell } from "@/components/layout/app-shell";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { currentMonthRange } from "@/lib/date-range";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import type { DashboardRead } from "@/lib/report-types";

export default function HomePage() {
  const { entityId } = useEntity();
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

  const kpis = data
    ? [
        { label: "Sales", value: formatTry(data.sales.total_sales_kurus) },
        { label: "Expenses", value: formatTry(data.total_expenses_kurus) },
        { label: "Net result", value: formatTry(data.net_result_kurus) },
        { label: "Payables", value: formatTry(data.total_payables_kurus) },
        { label: "Receivables", value: formatTry(data.total_receivables_kurus) },
        {
          label: "TRY position",
          value: formatTry(data.total_try_position_kurus),
        },
        {
          label: "Needs review",
          value: String(data.needs_review.total),
          href: undefined,
        },
      ]
    : [];

  const inTransitTotal = data?.delivery_in_transit.reduce(
    (sum, row) => sum + row.clearing_balance_kurus,
    0,
  );

  return (
    <AppShell title="Dashboard">
      <div className="mb-6">
        <ReportDateRange
          from={range.from}
          to={range.to}
          disabled={!entityId || loading}
          onChange={(from, to) => setRange({ from, to })}
        />
      </div>

      {!entityId && (
        <p className="text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}

      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
      {loading && <PageSkeleton />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="rounded-lg border border-border bg-card p-4"
              >
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {kpi.value}
                </p>
              </div>
            ))}
          </div>

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

          {data.needs_review.total > 0 && (
            <section className="mt-6 rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Needs review</h2>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {data.needs_review.invoice_drafts > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Invoice drafts</dt>
                    <dd className="tabular-nums">
                      {data.needs_review.invoice_drafts}
                    </dd>
                  </div>
                )}
                {data.needs_review.bank_statement_lines > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Bank lines</dt>
                    <dd className="tabular-nums">
                      {data.needs_review.bank_statement_lines}
                    </dd>
                  </div>
                )}
                {data.needs_review.pos_daily_summaries > 0 && (
                  <div>
                    <dt className="text-muted-foreground">POS summaries</dt>
                    <dd className="tabular-nums">
                      {data.needs_review.pos_daily_summaries}
                    </dd>
                  </div>
                )}
                {data.needs_review.delivery_reports > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Delivery reports</dt>
                    <dd className="tabular-nums">
                      {data.needs_review.delivery_reports}
                    </dd>
                  </div>
                )}
                {data.needs_review.expense_entries > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Expenses</dt>
                    <dd className="tabular-nums">
                      {data.needs_review.expense_entries}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {data.delivery_in_transit.length > 0 && (
            <section className="mt-6 rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Delivery in transit</h2>
                {inTransitTotal !== undefined && (
                  <span className="text-sm font-medium tabular-nums">
                    {formatTry(inTransitTotal)}
                  </span>
                )}
              </div>
              <ul className="space-y-2 text-sm">
                {data.delivery_in_transit.map((row) => (
                  <li
                    key={row.delivery_platform_id}
                    className="flex justify-between gap-2"
                  >
                    <span>{row.platform_name}</span>
                    <span className="tabular-nums">
                      {formatTry(row.clearing_balance_kurus)}
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

          {data.payables_preview.length > 0 && (
            <section className="mt-6 rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Top payables</h2>
                <Link
                  href="/payables"
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
                    <span className="tabular-nums">
                      {formatTry(row.try_cost_kurus)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
