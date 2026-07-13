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
import { computeTryCostKurusFromRate } from "@/lib/fx-purchase-helpers";
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
  /** GL account the payment was received into — restores the picker. */
  payment_account_id?: string | null;
  /** FX native amount received (minor units), for FX-wallet payments. */
  payment_native_quantity?: number | null;
  forex_currency?: string | null;
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
  const [rateText, setRateText] = useState("");
  const [tryValueTouched, setTryValueTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.gl_account_id === paymentGlAccountId),
    [accounts, paymentGlAccountId],
  );
  const isFxWallet = selectedAccount?.account_kind === "foreign_currency";

  const loadAccounts = useCallback(
    async (recorded: CorrectableCustomerPaymentRow) => {
      if (!entityId) return;
      const merged = await loadPaymentReceiveAccounts(entityId);
      setAccounts(merged);
      // Restore the account the payment was actually received into; fall back to
      // the first account only when the recorded one is unknown/unavailable.
      const chosen =
        (recorded.payment_account_id &&
          merged.find((a) => a.gl_account_id === recorded.payment_account_id)) ||
        merged[0];
      setPaymentGlAccountId(chosen?.gl_account_id ?? "");
      // If it was an FX-wallet payment, restore everything as recorded: the
      // forex amount received, the exact TRY book value, and the rate it was
      // booked at (derived from TRY ÷ forex) — so nothing has to be re-guessed.
      if (
        chosen?.account_kind === "foreign_currency" &&
        chosen.currency &&
        recorded.payment_native_quantity != null &&
        recorded.payment_native_quantity > 0
      ) {
        setForexAmountText(
          formatFxNative(recorded.payment_native_quantity, chosen.currency),
        );
        // amount_kurus and payment_native_quantity are both ×100-scaled, so their
        // ratio is TRY-per-unit directly; ×100 back into kuruş for the rate field.
        const rateKurus = Math.round(
          (Math.abs(recorded.amount_kurus) / recorded.payment_native_quantity) * 100,
        );
        setRateText(formatKurus(rateKurus));
        // Keep the recorded TRY value authoritative (don't let forex×rate rounding
        // nudge it).
        setTryValueTouched(true);
      }
    },
    [entityId],
  );

  useEffect(() => {
    if (!open || !payment) return;
    setDateText(formatTrDate(payment.movement_date));
    // Prefill the amount exactly as it was entered — a positive payment figure —
    // not the signed ledger value (a customer payment is stored as a negative
    // credit). Showing −13.200 both misrepresents the entry and blocks saving
    // (the form requires a positive amount).
    setAmountText(formatKurus(Math.abs(payment.amount_kurus)));
    setForexAmountText("");
    setRateText("");
    setTryValueTouched(false);
    setDescription(payment.description);
    setReason("");
    setError(null);
    // Load accounts last — it restores the recorded account and FX amount.
    void loadAccounts(payment).catch(() => undefined);
  }, [open, payment, loadAccounts]);

  useEffect(() => {
    if (!isFxWallet) {
      setForexAmountText("");
      setRateText("");
      setTryValueTouched(false);
    }
  }, [isFxWallet]);

  useEffect(() => {
    if (tryValueTouched) return;
    const computed = computeTryCostKurusFromRate(forexAmountText, rateText);
    if (computed === null) return;
    setAmountText(formatKurus(computed));
  }, [forexAmountText, rateText, tryValueTouched]);

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
          {isFxWallet && selectedAccount?.currency && (
            <div>
              <Label htmlFor="ccp-rate">
                Rate (TRY per 1 {selectedAccount.currency})
              </Label>
              <MoneyInput
                id="ccp-rate"
                value={rateText}
                onChange={setRateText}
                placeholder="e.g. 34,50"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Sets the TRY book value below (amount received × rate). You can
                still edit the TRY value directly.
              </p>
            </div>
          )}
          <div>
            <Label htmlFor="ccp-amount">
              {isFxWallet ? "TRY book value" : "Amount (TRY)"}
            </Label>
            <MoneyInput
              id="ccp-amount"
              value={amountText}
              onChange={(value) => {
                setTryValueTouched(true);
                setAmountText(value);
              }}
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
