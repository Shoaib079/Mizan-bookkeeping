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

import { VoidWarningBanner } from "@/components/ledger/void-warning-banner";

type Props = {
  open: boolean;
  title?: string;
  description?: string | null;
  voidPath: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function VoidSubledgerDialog({
  open,
  title = "Void record",
  description,
  voidPath,
  onClose,
  onSaved,
}: Props) {
  const { actorId } = useEntity();
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
    if (!open) return;
    setVoidDateText(todayTrDate());
    setReason("");
    setError(null);
  }, [open, voidPath]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!voidPath) {
      setError("Nothing selected to void.");
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
        apiFetch(voidPath, {
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
        }),
      );
      submitIdempotency.completeSubmit();
      onClose();
      onSaved();
      toast("Record voided");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Void failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title={title} onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
          <div className="mt-3">
            <VoidWarningBanner />
          </div>
          <div>
            <Label htmlFor="void-sub-date">Void date (DD.MM.YYYY)</Label>
            <DateInput
              id="void-sub-date"
              value={voidDateText}
              onChange={setVoidDateText}
              required
            />
          </div>
          <div>
            <Label htmlFor="void-sub-reason">Reason (optional)</Label>
            <Input
              id="void-sub-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary" disabled={submitting || !voidPath}>
              {submitting ? "Voiding…" : "Void"}
            </Button>
          </div>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
