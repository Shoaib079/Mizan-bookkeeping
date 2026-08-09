"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/input";
import { currentMonthRange, resolveReportRange } from "@/lib/date-range";
import { formatTrDate, parseTrDate } from "@/lib/money";

type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  disabled?: boolean;
  /** Let the end date be after today. Set by the general ledger only.
   *
   * Everywhere else the clamp is right — a report to a future date has no
   * answer. But this control also silently rewrote what someone typed: enter
   * a future end date and it snapped back to today with no explanation, so
   * an entry misdated into the future could not be brought into range and so
   * could not be voided. */
  allowFuture?: boolean;
};

export function ReportDateRange({
  from,
  to,
  onChange,
  disabled,
  allowFuture = false,
}: Props) {
  const [fromDisplay, setFromDisplay] = useState(() => formatTrDate(from));
  const [toDisplay, setToDisplay] = useState(() => formatTrDate(to));

  useEffect(() => {
    setFromDisplay(formatTrDate(from));
    setToDisplay(formatTrDate(to));
  }, [from, to]);

  const apply = () => {
    const parsedFrom = parseTrDate(fromDisplay);
    const parsedTo = parseTrDate(toDisplay);
    if (!parsedFrom || !parsedTo) return;
    const { from: nextFrom, to: nextTo } = resolveReportRange(
      parsedFrom,
      parsedTo,
      { from: parsedFrom, to: parsedTo },
      new Date(),
      { allowFuture },
    );
    if (nextTo !== parsedTo) {
      setToDisplay(formatTrDate(nextTo));
    }
    onChange(nextFrom, nextTo);
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-3 sm:gap-y-4">
      <div className="min-w-0 flex-1 sm:flex-none">
        <Label htmlFor="report-from">From</Label>
        <DateInput
          id="report-from"
          className="mt-1 w-full min-w-0 sm:w-36"
          value={fromDisplay}
          disabled={disabled}
          showLateNightHint={false}
          onChange={setFromDisplay}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </div>
      <div className="min-w-0 flex-1 sm:flex-none">
        <Label htmlFor="report-to">To</Label>
        <DateInput
          id="report-to"
          className="mt-1 w-full min-w-0 sm:w-36"
          value={toDisplay}
          disabled={disabled}
          showLateNightHint={false}
          onChange={setToDisplay}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </div>
      <div className="flex flex-wrap items-stretch gap-2 sm:items-end sm:pt-6">
        {/* Primary, not secondary. This is the action the whole control exists
            for, and `secondary` is `bg-background` — the page's own colour with
            a hairline border — so beside two filled date inputs it read as
            nothing at all. Downloads on these screens are `secondary`, which
            leaves Apply as the single filled button. */}
        <Button type="button" disabled={disabled} onClick={apply}>
          Apply
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            const range = currentMonthRange();
            onChange(range.from, range.to);
          }}
        >
          This month
        </Button>
      </div>
    </div>
  );
}
