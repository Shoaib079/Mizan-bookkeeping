"use client";

/** Cash / Card / Total StatCards for the sales period summary. */

import { Banknote, CreditCard, Wallet } from "lucide-react";

import { StatCard } from "@/components/page/stat-card";

export function SalesPostedKpiCards({
  cashKurus,
  cardKurus,
  totalKurus,
}: {
  cashKurus: number;
  cardKurus: number;
  totalKurus: number;
}) {
  return (
    <div
      data-testid="sales-posted-kpis"
      className="grid w-full gap-3 min-[820px]:grid-cols-3"
    >
      <StatCard
        label="Cash Sales"
        icon={Banknote}
        amountKurus={cashKurus}
        tone="good"
      />
      <StatCard
        label="Card Sales"
        icon={CreditCard}
        amountKurus={cardKurus}
        figureClassName="text-primary"
      />
      <StatCard
        label="Total Sales"
        icon={Wallet}
        amountKurus={totalKurus}
        iconTint="gray"
        iconStroke="gray"
        figureClassName="font-bold text-foreground"
      />
    </div>
  );
}
