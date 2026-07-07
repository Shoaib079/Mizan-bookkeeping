"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { apiFetch } from "@/lib/api";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";
import { useEntity } from "@/lib/entity-context";
import { formatFxNative, parseFxNative } from "@/lib/fx-money";
import { computeTryCostKurusFromRate } from "@/lib/fx-purchase-helpers";
import {
  loadPaymentReceiveAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { formatKurus, formatTry, parseTrDate, parseTryToKurus } from "@/lib/money";
import { todayTrDate } from "@/lib/dates";

type Props = {
  open: boolean;
  onClose: () => void;
  customerId: string;
  balanceKurus?: number;
  groupSaleId?: string;
  /** When set, payment clears native FX receivable — enter native amount only. */
  forexReceivableCurrency?: string | null;
  remainingForexMinor?: number | null;
  embedded?: boolean;
  onSaved?: () => void;
};

function accountLabel(account: MoneyAccountOption): string {
  if (account.account_kind === "foreign_currency" && account.currency) {
    return `${account.name} (${account.currency} wallet)`;
  }
  return `${account.name} (${account.account_kind})`;
}

export function CustomerPaymentForm({
  open,
  onClose,
  customerId,
  balanceKurus,
  groupSaleId,
  forexReceivableCurrency,
  remainingForexMinor,
  embedded,
  onSaved,
}: Props) {
  const { entityId, actorId } = useEntity();
  const { toast } = useToast();
  const submitIdempotency = useSubmitIdempotency();

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
  const [description, setDescription] = useState("Customer payment");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.gl_account_id === paymentGlAccountId),
    [accounts, paymentGlAccountId],
  );
  const isFxReceivable = Boolean(forexReceivableCurrency);
  const isFxWallet = selectedAccount?.account_kind === "foreign_currency";
  const walletMatchesReceivable =
    !isFxReceivable ||
    selectedAccount?.currency === forexReceivableCurrency;

  const loadAccounts = useCallback(async () => {
    if (!entityId) return;
    const merged = await loadPaymentReceiveAccounts(entityId);
    const filtered = isFxReceivable
      ? merged.filter(
          (a) =>
            a.account_kind === "foreign_currency" &&
            a.currency === forexReceivableCurrency,
        )
      : merged;
    setAccounts(filtered);
    if (filtered[0]) setPaymentGlAccountId(filtered[0].gl_account_id);
  }, [entityId, isFxReceivable, forexReceivableCurrency]);

  useEffect(() => {
    if (open) {
      setDateText(todayTrDate());
      setAmountText("");
      setForexAmountText("");
      setRateText("");
      setTryValueTouched(false);
      void loadAccounts().catch(() => undefined);
    }
  }, [open, loadAccounts]);

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
  const amountInvalid =
    amountText.trim() !== "" && (amountKurus === null || amountKurus <= 0);
  const forexInvalid =
    isFxWallet &&
    forexAmountText.trim() !== "" &&
    (forexMinor === null || forexMinor <= 0);
  const overBalance =
    balanceKurus !== undefined &&
    balanceKurus > 0 &&
    amountKurus !== null &&
    amountKurus > balanceKurus;
  const nativeOnlyPayment = isFxReceivable && isFxWallet && walletMatchesReceivable;
  const overNativeBalance =
    isFxReceivable &&
    remainingForexMinor != null &&
    remainingForexMinor > 0 &&
    forexMinor !== null &&
    forexMinor > remainingForexMinor;
  const submitBlocked = nativeOnlyPayment
    ? forexMinor === null ||
      forexMinor <= 0 ||
      overNativeBalance ||
      !walletMatchesReceivable
    : amountKurus === null ||
      amountKurus <= 0 ||
      overBalance ||
      (isFxWallet && (forexMinor === null || forexMinor <= 0));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityId) {
      setError("Select a restaurant in the sidebar first.");
      return;
    }
    const paymentDate = parseTrDate(dateText);
    if (!paymentDate) {
      setError("Date must be DD.MM.YYYY.");
      return;
    }
    if (!paymentGlAccountId) {
      setError("Choose where the payment was received.");
      return;
    }

    if (nativeOnlyPayment) {
      if (forexMinor === null || forexMinor <= 0) {
        setError(`Enter the ${forexReceivableCurrency} amount received.`);
        return;
      }
      if (overNativeBalance) {
        setError("Payment exceeds remaining balance for this sale.");
        return;
      }
    } else {
      if (amountKurus === null || amountKurus <= 0) {
        setError("Enter a valid TRY amount (reduces what they owe).");
        return;
      }
      if (isFxWallet && (forexMinor === null || forexMinor <= 0)) {
        setError("Enter the forex amount received.");
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const idempotencyKey = submitIdempotency.beginSubmit();
      const body: Record<string, unknown> = {
        payment_date: paymentDate,
        description,
        actor_id: actorId,
        payment_account_id: paymentGlAccountId,
        group_sale_id: groupSaleId,
      };
      if (nativeOnlyPayment) {
        body.payment_native_quantity = forexMinor;
      } else {
        body.amount_kurus = amountKurus;
        if (isFxWallet) body.payment_native_quantity = forexMinor;
      }
      await apiFetch(
        `/entities/${entityId}/customers/${customerId}/payments`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      submitIdempotency.completeSubmit();
      onSaved?.();
      toast("Payment received");
      onClose();
      setAmountText("");
      setForexAmountText("");
      setRateText("");
      setTryValueTouched(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title="Record customer payment"
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="cp-date">Payment date (DD.MM.YYYY)</Label>
          <DateInput
            id="cp-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
        {balanceKurus !== undefined && balanceKurus > 0 && !isFxReceivable && (
          <p className="text-sm text-muted-foreground">
            Outstanding receivable: {formatTry(balanceKurus)}
          </p>
        )}
        {isFxReceivable && remainingForexMinor != null && remainingForexMinor > 0 && (
          <p className="text-sm text-muted-foreground">
            Outstanding:{" "}
            {formatFxNative(remainingForexMinor, forexReceivableCurrency!)}
            {balanceKurus != null && balanceKurus > 0 && (
              <> ({formatTry(balanceKurus)} book)</>
            )}
          </p>
        )}
        <div>
          <Label htmlFor="cp-account">Received into</Label>
          <Combobox
            id="cp-account"
            value={paymentGlAccountId}
            onValueChange={setPaymentGlAccountId}
            options={accounts.map((a) => ({
              value: a.gl_account_id,
              label: accountLabel(a),
            }))}
            placeholder="Bank, cash, or FX wallet…"
          />
        </div>
        {(isFxWallet || isFxReceivable) && selectedAccount?.currency && (
          <div>
            <Label htmlFor="cp-forex">
              Amount received ({selectedAccount.currency})
            </Label>
            <Input
              id="cp-forex"
              value={forexAmountText}
              onChange={(e) => setForexAmountText(e.target.value)}
              placeholder={`e.g. 1.000,00 ${selectedAccount.currency}`}
              required
            />
            {forexInvalid && (
              <ValidationHint>Enter a valid forex amount.</ValidationHint>
            )}
            {overNativeBalance && (
              <ValidationHint>
                Amount exceeds remaining{" "}
                {forexReceivableCurrency ?? selectedAccount.currency} balance.
              </ValidationHint>
            )}
            {forexMinor !== null && forexMinor > 0 && selectedAccount.currency && (
              <p className="mt-1 text-xs text-muted-foreground">
                {formatFxNative(forexMinor, selectedAccount.currency)} into{" "}
                {selectedAccount.name}
              </p>
            )}
            {nativeOnlyPayment && (
              <p className="mt-1 text-xs text-muted-foreground">
                TRY carrying value is calculated from the sale — no payment-date rate.
              </p>
            )}
          </div>
        )}
        {(isFxWallet || isFxReceivable) &&
          selectedAccount?.currency &&
          !nativeOnlyPayment && (
            <div>
              <Label htmlFor="cp-rate">
                Rate (TRY per 1 {selectedAccount.currency})
              </Label>
              <MoneyInput
                id="cp-rate"
                value={rateText}
                onChange={setRateText}
                showPreview={false}
                showInvalidHint={false}
                placeholder="e.g. 34,50"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Sets the TRY book value below (amount received × rate). You can
                still edit the TRY value directly.
              </p>
            </div>
          )}
        {!nativeOnlyPayment && (
        <div>
          <Label htmlFor="cp-amount">
            {isFxWallet ? "TRY book value (reduces receivable)" : "Amount (TRY)"}
          </Label>
          <MoneyInput
            id="cp-amount"
            value={amountText}
            onChange={(value) => {
              setTryValueTouched(true);
              setAmountText(value);
            }}
            showPreview={false}
            showInvalidHint={false}
            required
          />
          {isFxWallet && !isFxReceivable && (
            <p className="mt-1 text-xs text-muted-foreground">
              Enter a rate above to fill this automatically, or type the lira
              value directly — same rule as FX elsewhere (no online rates).
            </p>
          )}
          {amountInvalid && (
            <ValidationHint>Enter an amount greater than zero.</ValidationHint>
          )}
          {overBalance && balanceKurus !== undefined && (
            <ValidationHint>
              Amount cannot exceed outstanding receivable ({formatTry(balanceKurus)}).
            </ValidationHint>
          )}
        </div>
        )}
        <div>
          <Label htmlFor="cp-desc">Description</Label>
          <Input
            id="cp-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || submitBlocked}>
          {submitting ? "Recording…" : "Record payment"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
