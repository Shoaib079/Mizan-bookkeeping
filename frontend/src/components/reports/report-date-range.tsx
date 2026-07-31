"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/input";
import { currentMonthRange } from "@/lib/date-range";
import { formatTrDate, parseTrDate } from "@/lib/money";

type Props = {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  disabled?: boolean;
};

export function ReportDateRange({ from, to, onChange, disabled }: Props) {
  const [fromDisplay, setFromDisplay] = useState(() => formatTrDate(from));
  const [toDisplay, setToDisplay] = useState(() => formatTrDate(to));

  useEffect(() => {
    setFromDisplay(formatTrDate(from));
    setToDisplay(formatTrDate(to));
  }, [from, to]);

  const apply = () => {
    const parsedFrom = parseTrDate(fromDisplay);
    const parsedTo = parseTrDate(toDisplay);
    if (parsedFrom && parsedTo) onChange(parsedFrom, parsedTo);
  };

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-4">
      <div>
        <Label htmlFor="report-from">From</Label>
        <DateInput
          id="report-from"
          className="mt-1 w-36"
          value={fromDisplay}
          disabled={disabled}
          showLateNightHint={false}
          onChange={setFromDisplay}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </div>
      <div>
        <Label htmlFor="report-to">To</Label>
        <DateInput
          id="report-to"
          className="mt-1 w-36"
          value={toDisplay}
          disabled={disabled}
          showLateNightHint={false}
          onChange={setToDisplay}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </div>
      <div className="flex flex-wrap items-end gap-2 pt-6">
        <Button type="button" variant="secondary" disabled={disabled} onClick={apply}>
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
