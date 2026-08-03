"use client";

/** Tap-to-edit period control for mobile reports sticky bar (C4.6). */

import { useState } from "react";

import { ReportDateRange } from "@/components/reports/report-date-range";
import { Dialog } from "@/components/ui/dialog";
import { formatTrDate } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = {
  from: string;
  to: string;
  disabled?: boolean;
  onChange: (from: string, to: string) => void;
  className?: string;
};

export function ReportPeriodTrigger({
  from,
  to,
  disabled,
  onChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        className={cn(
          "min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm font-medium transition-colors active:bg-muted/60 disabled:opacity-50",
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
        onClose={() => setOpen(false)}
      >
        <ReportDateRange
          from={from}
          to={to}
          disabled={disabled}
          onChange={(nextFrom, nextTo) => {
            onChange(nextFrom, nextTo);
            setOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}
