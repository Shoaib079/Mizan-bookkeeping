"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative, parseFxNative } from "@/lib/fx-money";
import {
  loadPaymentReceiveAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { formatKurus, formatTrDate, parseTrDate, parseTryToKurus } from "@/lib/money";
import { withPeriodUnlockReason } from "@/lib/period-unlock";
import { usePeriodUnlockSubmit } from "@/lib/use-period-unlock-submit";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type CorrectableCustomerPaymentRow = {
  journal_entry_id: string;
  movement_date: string;
  amount_kurus: number;
  description: string;
};

type Props = {
  open: boolean;
  customerId: string;
  payment: CorrectableCustomerPaymentRow | null;
  onClose: () => void;
  onSaved: () => void;
};

function accountLabel(account: MoneyAccountOption): string {
  if (account.account_kind === "foreign_currency" && account.currency) {
    return `${account.name} (${account.currency} wallet)`;
  }
  return `${account.name} (${account.account_kind})`;
}

export function CorrectCustomerPaymentForm({
  open,
  customerId,
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
  const [forexAmountText, setForexAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.gl_account_id === paymentGlAccountId),
    [accounts, paymentGlAccountId],
  );
  const isFxWallet = selectedAccount?.account_kind === "foreign_currency";

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const merged = await loadPaymentReceiveAccounts(entityId);
    setAccounts(merged);
    if (merged[0]) setPaymentGlAccountId(merged[0].gl_account_id);
  }, [entityId]);

  useEffect(() => {
    if (!open || !payment) return;
    void loadAccounts().catch(() => undefined);
    setDateText(formatTrDate(payment.movement_date));
    setAmountText(formatKurus(payment.amount_kurus));
    setForexAmountText("");
    setDescription(payment.description);
    setReason("");
    setError(null);
  }, [open, payment, loadAccounts]);

  useEffect(() => {
    if (!isFxWallet) setForexAmountText("");
  }, [isFxWallet]);

  const amountKurus = parseTryToKurus(amountText);
  const forexMinor = parseFxNative(forexAmountText);
  const submitBlocked =
    !payment ||
    !paymentGlAccountId ||
    amountKurus === null ||
    amountKurus <= 0 ||
    (isFxWallet && (forexMinor === null || forexMinor <= 0));

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
      setError("Enter a valid TRY amount.");
      return;
    }
    if (isFxWallet && (forexMinor === null || forexMinor <= 0)) {
      setError("Enter the forex amount received.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      await submitWithPeriodUnlock(async (periodUnlockReason) =>
        apiFetch(
          `/entities/${entityId}/customers/${customerId}/payments/${payment.journal_entry_id}/correct`,
          {
            method: "POST",
            idempotencyKey,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              withPeriodUnlockReason(
                {
                  payment_date: paymentDate,
                  amount_kurus: amountKurus,
                  description: description.trim() || "Customer payment",
                  actor_id: actorId,
                  payment_account_id: paymentGlAccountId,
                  payment_native_quantity: isFxWallet ? forexMinor : undefined,
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
      <Dialog open={open} title="Edit customer payment" onClose={onClose}>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label htmlFor="ccp-date">Payment date (DD.MM.YYYY)</Label>
            <DateInput
              id="ccp-date"
              value={dateText}
              onChange={setDateText}
              required
            />
          </div>
          <div>
            <Label htmlFor="ccp-account">Received into</Label>
            <Combobox
              id="ccp-account"
              value={paymentGlAccountId}
              onValueChange={setPaymentGlAccountId}
              options={accounts.map((a) => ({
                value: a.gl_account_id,
                label: accountLabel(a),
              }))}
              placeholder="Bank, cash, or FX wallet…"
            />
          </div>
          {isFxWallet && selectedAccount?.currency && (
            <div>
              <Label htmlFor="ccp-forex">
                Amount received ({selectedAccount.currency})
              </Label>
              <Input
                id="ccp-forex"
                value={forexAmountText}
                onChange={(e) => setForexAmountText(e.target.value)}
                placeholder={`e.g. 1.000,00 ${selectedAccount.currency}`}
                required
              />
            </div>
          )}
          <div>
            <Label htmlFor="ccp-amount">
              {isFxWallet ? "TRY book value" : "Amount (TRY)"}
            </Label>
            <MoneyInput
              id="ccp-amount"
              value={amountText}
              onChange={setAmountText}
              required
            />
          </div>
          <div>
            <Label htmlFor="ccp-desc">Description</Label>
            <Input
              id="ccp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="ccp-reason">Edit reason (optional)</Label>
            <Input
              id="ccp-reason"
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
