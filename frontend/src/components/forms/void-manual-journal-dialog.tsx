"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import { parseTrDate } from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type VoidableManualJournal = {
  id: string;
  entry_date: string;
  description: string;
};

type Props = {
  open: boolean;
  journal: VoidableManualJournal | null;
  onClose: () => void;
  onSaved: () => void;
};

export function VoidManualJournalDialog({
  open,
  journal,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  const [voidDateText, setVoidDateText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !journal) return;
    setVoidDateText(todayTrDate());
    setReason("");
    setError(null);
  }, [open, journal]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !journal) {
      setError("Select a restaurant and journal first.");
      return;
    }
    const voidDate = parseTrDate(voidDateText);
    if (!voidDate) {
      setError("Void date must be DD.MM.YYYY.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/manual-journals/${journal.id}/void`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  actor_id: actorId,
                  void_date: voidDate,
                  reason: reason.trim() || null,
                },
                periodUnlockReason,
              ),
            ),
          },
        ),
      );
      submitIdempotency.completeSubmit();
      onClose();
      onSaved();
      toast("Manual journal voided");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Void failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title="Void manual journal" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          {journal && (
            <p className="text-sm text-muted-foreground">
              {journal.description}
            </p>
          )}
          <div>
            <Label htmlFor="vmj-void-date">Void date (DD.MM.YYYY)</Label>
            <DateInput
              id="vmj-void-date"
              value={voidDateText}
              onChange={setVoidDateText}
              required
            />
          </div>
          <div>
            <Label htmlFor="vmj-reason">Reason (optional)</Label>
            <Input
              id="vmj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting || !journal}>
            {submitting ? "Voiding…" : "Void journal"}
          </Button>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
