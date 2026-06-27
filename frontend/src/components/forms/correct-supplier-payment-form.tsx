"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import {
  loadBankAndCashAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { formatKurus, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type CorrectableSupplierPaymentRow = {
  journal_entry_id: string;
  movement_date: string;
  amount_kurus: number;
  description: string;
};

type Props = {
  open: boolean;
  supplierId: string;
  payment: CorrectableSupplierPaymentRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CorrectSupplierPaymentForm({
  open,
  supplierId,
  payment,
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

  const [accounts, setAccounts] = useState<MoneyAccountOption[]>([]);
  const [paymentGlAccountId, setPaymentGlAccountId] = useState("");
  const [dateText, setDateText] = useState("");
  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const merged = await loadBankAndCashAccounts(entityId);
    setAccounts(merged);
    if (merged[0]) setPaymentGlAccountId(merged[0].gl_account_id);
  }, [entityId]);

  useEffect(() => {
    if (!open || !payment) return;
    void loadAccounts().catch(() => undefined);
    setDateText(formatTrDate(payment.movement_date));
    setAmountText(formatKurus(payment.amount_kurus));
    setDescription(payment.description);
    setReference("");
    setReason("");
    setError(null);
  }, [open, payment, loadAccounts]);

  const amountKurus = parseTryToKurus(amountText);
  const submitBlocked =
    !payment ||
    !paymentGlAccountId ||
    amountKurus === null ||
    amountKurus <= 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId || !payment) {
      setError("Select a restaurant and payment first.");
      return;
    }
    const paymentDate = parseTrDate(dateText);
    if (!paymentDate) {
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
          `/entities/${entityId}/suppliers/${supplierId}/payments/${payment.journal_entry_id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  payment_date: paymentDate,
                  amount_kurus: amountKurus,
                  description: description.trim() || "Supplier payment",
                  actor_id: actorId,
                  payment_account_id: paymentGlAccountId,
                  reference: reference.trim() || null,
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
      toast("Payment corrected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Correction failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Dialog open={open} title="Correct supplier payment" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="csp-date">Payment date (DD.MM.YYYY)</Label>
            <DateInput
              id="csp-date"
              value={dateText}
              onChange={setDateText}
              required
            />
          </div>
          <div>
            <Label htmlFor="csp-amount">Amount (TRY)</Label>
            <MoneyInput
              id="csp-amount"
              value={amountText}
              onChange={setAmountText}
              required
            />
          </div>
          <div>
            <Label htmlFor="csp-desc">Description</Label>
            <Input
              id="csp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="csp-ref">Reference (optional)</Label>
            <Input
              id="csp-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="csp-account">Pay from</Label>
            <Combobox
              id="csp-account"
              value={paymentGlAccountId}
              onValueChange={setPaymentGlAccountId}
              options={accounts.map((a) => ({
                value: a.gl_account_id,
                label: `${a.name} (${a.account_kind})`,
              }))}
              placeholder="Cash or bank account…"
            />
          </div>
          <div>
            <Label htmlFor="csp-reason">Correction reason (optional)</Label>
            <Input
              id="csp-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={submitting || submitBlocked}>
            {submitting ? "Saving…" : "Save correction"}
          </Button>
        </form>
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
