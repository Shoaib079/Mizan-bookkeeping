"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import {
  formatKurus,
  formatTrDate,
  parseTrDate,
  parseTryToKurus,
} from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type CorrectableProfitAllocationRow = {
  journal_entry_id: string;
  allocation_date: string;
  description: string;
  profit_kurus: number;
};

type Props = {
  entry: CorrectableProfitAllocationRow | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function CorrectPartnerProfitAllocationForm({
  entry,
  open,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  const [allocationDateText, setAllocationDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [periodFromText, setPeriodFromText] = useState("");
  const [periodToText, setPeriodToText] = useState("");
  const [description, setDescription] = useState("");
  const [netAgainstDrawings, setNetAgainstDrawings] = useState(true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !entry) return;
    submitIdempotency.resetSubmit();
    setAllocationDateText(formatTrDate(entry.allocation_date));
    setAmountText(formatKurus(entry.profit_kurus));
    setPeriodFromText("");
    setPeriodToText("");
    setDescription(entry.description);
    setNetAgainstDrawings(true);
    setReason("");
    setError(null);
  }, [open, entry, submitIdempotency]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !entry) {
      setError("Select a restaurant first.");
      return;
    }
    const allocationDate = parseTrDate(allocationDateText);
    if (!allocationDate) {
      setError("Allocation date must be DD.MM.YYYY.");
      return;
    }
    const profitKurus = parseTryToKurus(amountText);
    if (profitKurus === null || profitKurus <= 0) {
      setError("Enter the profit amount you want to allocate.");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required for corrections.");
      return;
    }
    const periodFrom = parseTrDate(periodFromText);
    const periodTo = parseTrDate(periodToText);
    if ((periodFrom && !periodTo) || (!periodFrom && periodTo)) {
      setError("Set both period from and to, or leave both blank.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/partners/profit-allocation/${entry.journal_entry_id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  allocation_date: allocationDate,
                  profit_kurus: profitKurus,
                  description: description.trim(),
                  actor_id: actorId,
                  net_against_drawings: netAgainstDrawings,
                  reason: reason.trim(),
                  ...(periodFrom && periodTo
                    ? { period_from: periodFrom, period_to: periodTo }
                    : {}),
                },
                periodUnlockReason,
              ),
            ),
          },
        ),
      );
      submitIdempotency.completeSubmit();
      toast("Profit allocation corrected");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title="Edit profit allocation" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Saves by voiding the old journal and posting a new one. Partner
            capital, settlement, and unpaid profit update to the new total.
          </p>

          <div>
            <Label htmlFor="correct-alloc-date">Allocation date</Label>
            <DateInput
              id="correct-alloc-date"
              value={allocationDateText}
              onChange={setAllocationDateText}
            />
          </div>

          <div>
            <Label htmlFor="correct-alloc-amount">Profit amount (TRY)</Label>
            <MoneyInput
              id="correct-alloc-amount"
              value={amountText}
              onChange={setAmountText}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="correct-period-from">
                Period from (drawings cutoff, optional)
              </Label>
              <DateInput
                id="correct-period-from"
                value={periodFromText}
                onChange={setPeriodFromText}
              />
            </div>
            <div>
              <Label htmlFor="correct-period-to">Period to (optional)</Label>
              <DateInput
                id="correct-period-to"
                value={periodToText}
                onChange={setPeriodToText}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="correct-alloc-desc">Description</Label>
            <Input
              id="correct-alloc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={netAgainstDrawings}
              onChange={(e) => setNetAgainstDrawings(e.target.checked)}
            />
            <span>
              Net against amount already taken as of the period end / date
            </span>
          </label>

          <div>
            <Label htmlFor="correct-alloc-reason">Reason</Label>
            <Input
              id="correct-alloc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this total is wrong"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save correction"}
            </Button>
          </div>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
