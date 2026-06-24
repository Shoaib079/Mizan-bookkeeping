"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { isoToday } from "@/lib/date-range";
import { formatTrDate, parseTrDate } from "@/lib/money";

type Props = {
  asOf: string;
  onChange: (asOf: string) => void;
  disabled?: boolean;
};

export function ReportAsOfDate({ asOf, onChange, disabled }: Props) {
  const [display, setDisplay] = useState(() => formatTrDate(asOf));

  useEffect(() => {
    setDisplay(formatTrDate(asOf));
  }, [asOf]);

  const apply = () => {
    const parsed = parseTrDate(display);
    if (parsed) onChange(parsed);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="report-as-of">As of</Label>
        <Input
          id="report-as-of"
          className="mt-1 w-36"
          placeholder="DD.MM.YYYY"
          value={display}
          disabled={disabled}
          onChange={(e) => setDisplay(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </div>
      <Button type="button" variant="secondary" disabled={disabled} onClick={apply}>
        Apply
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        onClick={() => onChange(isoToday())}
      >
        Today
      </Button>
    </div>
  );
}
