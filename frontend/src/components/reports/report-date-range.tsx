"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { currentMonthRange, resolveReportRange } from "@/lib/date-range";
import {
  DESKTOP_SHELL_ONLY,
  MOBILE_SHELL_ONLY,
} from "@/lib/mobile-shell";
import { formatTrDate, parseTrDate } from "@/lib/money";
import { cn } from "@/lib/utils";

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

/** From / To / Apply / This month — the form body (desktop, or inside a sheet). */
export function ReportDateRangeFields({
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
    <div
      data-testid="report-date-range-fields"
      className="flex flex-col gap-4 min-[820px]:flex-row min-[820px]:flex-wrap min-[820px]:items-start min-[820px]:gap-x-3 min-[820px]:gap-y-4"
    >
      <div className="min-w-0 flex-1 min-[820px]:flex-none">
        <Label htmlFor="report-from">From</Label>
        <DateInput
          id="report-from"
          className="mt-1 w-full min-w-0 min-[820px]:w-36"
          value={fromDisplay}
          disabled={disabled}
          showLateNightHint={false}
          onChange={setFromDisplay}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </div>
      <div className="min-w-0 flex-1 min-[820px]:flex-none">
        <Label htmlFor="report-to">To</Label>
        <DateInput
          id="report-to"
          className="mt-1 w-full min-w-0 min-[820px]:w-36"
          value={toDisplay}
          disabled={disabled}
          showLateNightHint={false}
          onChange={setToDisplay}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </div>
      <div className="flex flex-wrap items-stretch gap-2 min-[820px]:items-end min-[820px]:pt-6">
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

/** Chip that opens a sheet with From/To/Apply (mobile period picker). */
export function ReportPeriodTrigger({
  from,
  to,
  disabled,
  onChange,
  className,
  allowFuture,
}: Props & { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        data-testid="report-period-chip"
        disabled={disabled}
        className={cn(
          "min-w-0 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm font-medium transition-colors active:bg-muted/60 disabled:opacity-50",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        <span className="block truncate tabular-nums">
          {formatTrDate(from)} – {formatTrDate(to)}
        </span>
      </button>
      <Dialog
        open={open}
        title="Report period"
        mobilePresentation="sheet"
        onClose={() => setOpen(false)}
      >
        <ReportDateRangeFields
          from={from}
          to={to}
          disabled={disabled}
          allowFuture={allowFuture}
          onChange={(nextFrom, nextTo) => {
            onChange(nextFrom, nextTo);
            setOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}

/** Desktop (≥820): full fields. Mobile shell: one chip opening the period sheet. */
export function ReportDateRange(props: Props) {
  return (
    <div data-testid="report-date-range">
      <div className={MOBILE_SHELL_ONLY} data-testid="report-date-range-mobile">
        <ReportPeriodTrigger {...props} />
      </div>
      <div
        className={DESKTOP_SHELL_ONLY}
        data-testid="report-date-range-desktop"
      >
        <ReportDateRangeFields {...props} />
      </div>
    </div>
  );
}
