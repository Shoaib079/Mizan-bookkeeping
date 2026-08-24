"use client";

/** Done panel after close day (optional send home). */

import { Button } from "@/components/ui/button";
import { formatTry } from "@/lib/money";

export type CashCloseDayDoneProps = {
  moneyAccountName: string;
  leftKurus: number | null;
  sentKurus: number;
  destLabel: string | null;
  embedded: boolean;
  onCloseAnotherDay: () => void;
  onClose: () => void;
};

export function CashCloseDayDone({
  moneyAccountName,
  leftKurus,
  sentKurus,
  destLabel,
  embedded,
  onCloseAnotherDay,
  onClose,
}: CashCloseDayDoneProps) {
  const doneSummary =
    sentKurus > 0 && destLabel
      ? leftKurus !== null
        ? `${moneyAccountName} still has ${formatTry(leftKurus)} (float) · sent ${formatTry(sentKurus)} to ${destLabel} — finished.`
        : `Sent ${formatTry(sentKurus)} to ${destLabel} — finished.`
      : leftKurus !== null
        ? `Day closed. ${moneyAccountName} still has ${formatTry(leftKurus)} (counter float) — finished.`
        : `Day closed. Float stays in ${moneyAccountName} — finished.`;

  return (
    <div className="space-y-4" data-testid="cash-count-done">
      <div className="rounded-md border border-border bg-muted/40 p-3">
        <p className="text-sm font-medium">All done</p>
        <p className="mt-1 text-sm text-muted-foreground">{doneSummary}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={onCloseAnotherDay}>
          Close another day
        </Button>
        {!embedded && (
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  );
}
