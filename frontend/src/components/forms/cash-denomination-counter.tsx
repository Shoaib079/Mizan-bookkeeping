"use client";

/** Note/coin count helper — multiplies quantities into a TRY total. */

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  TRY_DENOMINATIONS,
  denominationLinesFromQuantities,
  denominationTotalKurus,
} from "@/lib/cash-denominations";
import { formatTry } from "@/lib/money";

type Props = {
  quantities: Record<number, number>;
  onChange: (next: Record<number, number>) => void;
  onClear: () => void;
};

export function CashDenominationCounter({
  quantities,
  onChange,
  onClear,
}: Props) {
  const lines = useMemo(
    () => denominationLinesFromQuantities(quantities),
    [quantities],
  );
  const totalKurus = denominationTotalKurus(lines);
  const hasAny = lines.length > 0;

  function setQuantity(denomination_kurus: number, raw: string) {
    const parsed = raw.trim() === "" ? 0 : Number.parseInt(raw, 10);
    const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    onChange({ ...quantities, [denomination_kurus]: quantity });
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Count by notes</p>
          <p className="text-xs text-muted-foreground">
            Enter how many of each — total fills counted cash.
          </p>
        </div>
        {hasAny && (
          <Button type="button" variant="secondary" onClick={onClear}>
            Clear notes
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TRY_DENOMINATIONS.map((d) => {
          const qty = quantities[d.denomination_kurus] ?? 0;
          const lineTotal = d.denomination_kurus * qty;
          return (
            <div key={d.denomination_kurus} className="space-y-1">
              <Label
                htmlFor={`denom-${d.denomination_kurus}`}
                className="text-xs"
              >
                {d.label}
              </Label>
              <Input
                id={`denom-${d.denomination_kurus}`}
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="0"
                value={qty === 0 ? "" : String(qty)}
                onChange={(e) =>
                  setQuantity(d.denomination_kurus, e.target.value)
                }
              />
              {qty > 0 && (
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {formatTry(lineTotal)}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-baseline justify-between border-t border-border pt-2">
        <span className="text-sm text-muted-foreground">Notes total</span>
        <span className="text-base font-semibold tabular-nums">
          {formatTry(totalKurus)}
        </span>
      </div>
    </div>
  );
}
