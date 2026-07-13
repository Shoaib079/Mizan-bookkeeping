"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatKurus, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type CorrectableCreditSaleRow = {
  journal_entry_id: string;
  movement_date: string;
  amount_kurus: number;
  description: string;
};

type Props = {
  open: boolean;
  customerId: string;
  sale: CorrectableCreditSaleRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CorrectCreditSaleForm({
  open,
  customerId,
  sale,
  onClose,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();
  const { submitWithPeriodUnlock, PeriodUnlockDialog } = usePeriodUnlockSubmit();

  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) submitIdempotency.resetSubmit();
  }, [open, submitIdempotency]);

  useEffect(() => {
    if (!open || !sale) return;
    setDateText(formatTrDate(sale.movement_date));
    // Show the amount as entered (positive magnitude), not the signed ledger value.
    setAmountText(formatKurus(Math.abs(sale.amount_kurus)));
    setDescription(sale.description);
    setReason("");
    setError(null);
  }, [open, sale]);

  const amountKurus = parseTryToKurus(amountText);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !sale) return;
    const saleDate = parseTrDate(dateText);
    if (!saleDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (amountKurus === null || amountKurus <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/customers/${customerId}/credit-sales/${sale.journal_entry_id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  sale_date: saleDate,
                  amount_kurus: amountKurus,
                  description: description.trim() || "Credit sale",
                  actor_id: actorId,
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
      toast("Credit sale corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title="Edit credit sale" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="ccs-date">Sale date</Label>
            <DateInput id="ccs-date" value={dateText} onChange={setDateText} required />
          </div>
          <div>
            <Label htmlFor="ccs-amount">Amount (TRY)</Label>
            <MoneyInput id="ccs-amount" value={amountText} onChange={setAmountText} required />
          </div>
          <div>
            <Label htmlFor="ccs-desc">Description</Label>
            <Input
              id="ccs-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="ccs-reason">Edit reason (optional)</Label>
            <Input id="ccs-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting || amountKurus === null || amountKurus <= 0}>
            {submitting ? "Saving…" : "Save correction"}
          </Button>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
