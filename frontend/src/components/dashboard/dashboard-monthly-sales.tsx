"use client";

/** This-month Cash / Card / Total sales with vs-last-month trend pills. */

import { CreditCard, ShoppingBag, Wallet } from "lucide-react";

import { StatCard } from "@/components/page/stat-card";
import { monthOverMonthTrend } from "@/lib/month-over-month-trend";
import type { DashboardRead } from "@/lib/report-types";

type Props = {
  current: DashboardRead["sales"] | null;
  prior: DashboardRead["sales"] | null;
};

export function DashboardMonthlySales({ current, prior }: Props) {
  if (!current) return null;

  const cashTrend = monthOverMonthTrend(
    current.cash_sales_kurus,
    prior?.cash_sales_kurus ?? 0,
  );
  const cardTrend = monthOverMonthTrend(
    current.pos_card_sales_kurus,
    prior?.pos_card_sales_kurus ?? 0,
  );
  const totalTrend = monthOverMonthTrend(
    current.total_sales_kurus,
    prior?.total_sales_kurus ?? 0,
  );

  return (
    <div
      data-testid="dashboard-monthly-sales"
      className="grid gap-3 sm:grid-cols-3"
    >
      <StatCard
        label="Cash"
        caption="This month"
        icon={Wallet}
        amountKurus={current.cash_sales_kurus}
        trend={cashTrend}
        tone="good"
        iconTint="mint"
        iconStroke="green"
      />
      <StatCard
        label="Card"
        caption="This month"
        icon={CreditCard}
        amountKurus={current.pos_card_sales_kurus}
        trend={cardTrend}
        iconTint="sky"
        iconStroke="blue"
      />
      <StatCard
        label="Total"
        caption="This month"
        icon={ShoppingBag}
        amountKurus={current.total_sales_kurus}
        trend={totalTrend}
      />
    </div>
  );
}
