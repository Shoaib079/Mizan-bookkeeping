"use client";

/** Correct a salary a partner paid out of their own pocket.
 *
 * Deliberately three fields. One journal entry writes the staff rows for the
 * salary (and any advance it consumed or created) *and* the partner row for
 * what the business now owes — so the correction voids the whole entry and
 * reposts, and the advance arithmetic is recomputed against the real position
 * rather than copied from the old one.
 *
 * There is no period and no extra-days input, and that is the point. What the
 * employee earned is a separate accrual this payment only settles; voiding the
 * payment leaves it standing, exactly as it should. Offering to change it here
 * would let "I paid 32.500, not 35.000" quietly rewrite what they were owed.
 */

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

export type CorrectablePartnerFundedSalaryRow = {
  journal_entry_id: string;
  movement_date: string;
  description: string;
  amount_kurus: number;
};

type Props = {
  entry: CorrectablePartnerFundedSalaryRow | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function CorrectPartnerFundedSalaryForm({
  entry,
  open,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  const [paymentDateText, setPaymentDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !entry) return;
    submitIdempotency.resetSubmit();
    setPaymentDateText(formatTrDate(entry.movement_date));
    setAmountText(formatKurus(Math.abs(entry.amount_kurus)));
    setDescription(entry.description);
    setReason("");
    setError(null);
  }, [open, entry, submitIdempotency]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !entry) {
      setError("Select a restaurant first.");
      return;
    }
    const paymentDate = parseTrDate(paymentDateText);
    if (!paymentDate) {
      setError("Payment date must be DD.MM.YYYY.");
      return;
    }
    const amountMinor = parseTryToKurus(amountText);
    if (amountMinor === null || amountMinor <= 0) {
      setError("Enter the amount the partner actually paid.");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required for corrections.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/staff/partner-funded-salary/${entry.journal_entry_id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  payment_date: paymentDate,
                  amount_minor: amountMinor,
                  description: description.trim(),
                  actor_id: actorId,
                  reason: reason.trim(),
                },
                periodUnlockReason,
              ),
            ),
          },
        ),
      );
      submitIdempotency.completeSubmit();
      toast("Partner-paid salary corrected");
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
      <Dialog open={open} title="Edit partner-paid salary" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Saves by voiding the old journal and posting a new one, so the
            employee&apos;s record and what the business owes the partner move
            together. What the employee earned for the period is not changed —
            edit the accrual on their page for that.
          </p>

          <div>
            <Label htmlFor="correct-pfs-date">Payment date</Label>
            <DateInput
              id="correct-pfs-date"
              value={paymentDateText}
              onChange={setPaymentDateText}
            />
          </div>

          <div>
            <Label htmlFor="correct-pfs-amount">Amount paid (TRY)</Label>
            <MoneyInput
              id="correct-pfs-amount"
              value={amountText}
              onChange={setAmountText}
            />
          </div>

          <div>
            <Label htmlFor="correct-pfs-desc">Description</Label>
            <Input
              id="correct-pfs-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="correct-pfs-reason">Reason</Label>
            <Input
              id="correct-pfs-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this payment is wrong"
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
