"use client";

/** Posted-sales period chips + Custom date picker (split from sales panel). */

import { useEffect, useState } from "react";

import { FilterChips } from "@/components/page/filter-chips";
import { ReportDateRange } from "@/components/reports/report-date-range";
import {
  rangeForSalesPeriodChip,
  salesPeriodChipForRange,
  SALES_PERIOD_CHIPS,
  type SalesPeriodChip,
} from "@/lib/sales-period-chips";

type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  disabled?: boolean;
  /** Injectable clock for tests. */
  now?: Date;
};

export function SalesPeriodChips({
  from,
  to,
  onChange,
  disabled,
  now,
}: Props) {
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
