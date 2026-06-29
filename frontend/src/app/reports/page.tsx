"use client";

/** Reports landing — card library (Phase 9 Slice 8). */

import {
  ArrowLeftRight,
  BarChart3,
  FileSpreadsheet,
  Landmark,
  Percent,
  Scale,
  TrendingUp,
  Truck,
} from "lucide-react";
import Link from "next/link";

import { ReportDateRange } from "@/components/reports/report-date-range";
import { AppShell } from "@/components/layout/app-shell";
import { apiFetch } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error-message";
import { buildRangeQuery, currentMonthRange } from "@/lib/date-range";
import {
  filterDeliveryReportCards,
  filterFinancialReportCards,
  shouldShowNetResultSummary,
} from "@/lib/entity-access";
import { isEntitySettingEnabled } from "@/lib/entity-settings";
import { useEntity } from "@/lib/entity-context";
import { formatTry } from "@/lib/money";
import type { DashboardRead } from "@/lib/report-types";
import { useEntityAccess } from "@/lib/use-entity-access";
import { useCallback, useEffect, useMemo, useState } from "react";

type ReportCard = {
  href: string;
  title: string;
  description: string;
  icon: typeof TrendingUp;
  category: string;
  financial: boolean;
  asOf?: boolean;
};

const reportCards: ReportCard[] = [
  {
    href: "/reports/profit-and-loss",
    title: "Profit & loss",
    description: "Revenue and expense accounts for the period.",
    icon: TrendingUp,
    category: "Financial statements",
    financial: true,
  },
  {
    href: "/reports/balance-sheet",
    title: "Balance sheet",
    description: "Assets, liabilities, and equity as of a date.",
    icon: Scale,
    category: "Financial statements",
    financial: true,
    asOf: true,
  },
  {
    href: "/reports/cash-flow",
    title: "Cash flow",
    description: "TRY liquid cash movement by category.",
    icon: ArrowLeftRight,
    category: "Financial statements",
    financial: true,
  },
  {
    href: "/reports/kdv-input",
    title: "KDV input",
    description: "Purchase VAT from supplier invoices by rate.",
    icon: Percent,
    category: "Tax",
    financial: false,
  },
  {
    href: "/reports/delivery-sales",
    title: "Delivery sales",
    description: "Gross sales per delivery platform.",
    icon: Truck,
    category: "Sales",
    financial: false,
  },
  {
    href: "/reports/period-comparison",
    title: "Period comparison",
    description: "Current vs prior period key metrics.",
    icon: BarChart3,
    category: "Business overview",
    financial: true,
  },
];

export default function ReportsPage() {
  return (
    <AppShell title="Reports">
      <ReportsBody />
    </AppShell>
  );
}

function ReportsBody() {
  const { entityId } = useEntity();
  const { role } = useEntityAccess();
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [range, setRange] = useState(currentMonthRange);
  const [summary, setSummary] = useState<DashboardRead | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entityId) {
      setDeliveryEnabled(false);
      return;
    }
    void isEntitySettingEnabled(entityId, "delivery_enabled")
      .then(setDeliveryEnabled)
      .catch(() => setDeliveryEnabled(false));
  }, [entityId]);

  const visibleCards = useMemo(
    () =>
      filterDeliveryReportCards(
        filterFinancialReportCards(reportCards, role),
        deliveryEnabled,
      ),
    [role, deliveryEnabled],
  );

  const reload = useCallback(async () => {
    if (!entityId) {
      setSummary(null);
      setSummaryError(null);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<DashboardRead>(
        `/entities/${entityId}/dashboard?from=${range.from}&to=${range.to}`,
      );
      setSummary(res);
      setSummaryError(null);
    } catch (err) {
      setSummary(null);
      setSummaryError(
        apiErrorMessage(err, "Could not load summary for this period"),
      );
    } finally {
      setLoading(false);
    }
  }, [entityId, range.from, range.to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const qs = buildRangeQuery(range.from, range.to);

  return (
    <>
      <div className="mb-6 space-y-4">
        <ReportDateRange
          from={range.from}
          to={range.to}
          disabled={!entityId || loading}
          onChange={(from, to) => setRange({ from, to })}
        />
        {summaryError && (
          <p className="text-sm text-destructive">{summaryError}</p>
        )}
        {summary && (
          <div className="flex flex-wrap gap-6 rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <div>
              <span className="text-muted-foreground">Sales · </span>
              <span className="font-medium tabular-nums">
                {formatTry(summary.sales.total_sales_kurus)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Expenses · </span>
              <span className="font-medium tabular-nums">
                {formatTry(summary.total_expenses_kurus)}
              </span>
            </div>
            {shouldShowNetResultSummary(role) && (
              <div>
                <span className="text-muted-foreground">Net · </span>
                <span className="font-medium tabular-nums">
                  {formatTry(summary.net_result_kurus)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {!entityId && (
        <p className="mb-4 text-sm text-muted-foreground">
          Select a restaurant in the sidebar.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCards.map((card) => {
          const href = card.asOf
            ? `${card.href}?as_of=${range.to}`
            : `${card.href}?${qs}`;
          return (
            <Link
              key={card.href}
              href={href}
              className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <card.icon className="size-5 text-primary" />
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {card.category}
                </span>
              </div>
              <h2 className="font-semibold group-hover:text-primary">
                {card.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {card.description}
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <FileSpreadsheet className="size-3.5" />
                Excel
                {card.financial && !card.asOf && " · PDF"}
              </div>
            </Link>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        <Landmark className="mr-1 inline size-3.5" />
        Financial statements require owner or accountant access when auth is
        enforced.
      </p>
    </>
  );
}
