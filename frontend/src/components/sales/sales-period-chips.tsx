"use client";

/** Posted-sales period chips + Custom date picker + KPI cards (sales panel). */

import { Banknote, CreditCard, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { FilterChips } from "@/components/page/filter-chips";
import { StatCard } from "@/components/page/stat-card";
import { ReportDateRange } from "@/components/reports/report-date-range";
import {
  rangeForSalesPeriodChip,
  salesPeriodChipForRange,
  SALES_PERIOD_CHIPS,
  type SalesPeriodChip,
} from "@/lib/sales-period-chips";

type ChipsProps = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  disabled?: boolean;
  now?: Date;
};

export function SalesPeriodChips({
  from,
  to,
  onChange,
  disabled,
  now,
}: ChipsProps) {
  const [chip, setChip] = useState<SalesPeriodChip>(() =>
    salesPeriodChipForRange(from, to, now ?? new Date()),
  );

  useEffect(() => {
    setChip(salesPeriodChipForRange(from, to, now ?? new Date()));
  }, [from, to, now]);

  function onChip(next: SalesPeriodChip) {
    setChip(next);
    const range = rangeForSalesPeriodChip(next, now ?? new Date());
    if (range) onChange(range.from, range.to);
  }

  return (
    <div
      data-testid="sales-period-chips"
      className="flex w-full flex-col gap-2"
    >
      <FilterChips
        chips={SALES_PERIOD_CHIPS}
        value={chip}
        onChange={onChip}
        ariaLabel="Sales period"
      />
      {chip === "custom" && (
        <ReportDateRange
          from={from}
          to={to}
          disabled={disabled}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/** Cash / Card / Total StatCards for the Posted period (sales-summary API). */
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
      className="grid w-full gap-3 sm:grid-cols-3"
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
