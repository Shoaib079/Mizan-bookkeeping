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
import {
  formatForexBalanceSummary,
  formatFxNative,
  parseFxNative,
} from "@/lib/fx-money";
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
  /** Everything this customer owes, per currency — the whole account, not the
   * one sale being paid. Shown when there is no single FX sale in context. */
  outstandingByCurrency?: { currency: string; minor: number }[];
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
  outstandingByCurrency,
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
  const forexSummary = formatForexBalanceSummary(outstandingByCurrency);
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

  /** Would this receipt take the customer past settled, into credit?
   *
   * Only asked on the path that nothing else checks. When a TRY amount is
   * entered alongside the foreign one, the API takes the lira figure and
   * returns before `compute_try_payment_from_native` runs — and that function
   * is where "payment exceeds forex receivable balance" lives. So the native
   * quantity is stored exactly as typed, with nothing comparing it to what is
   * owed. That is how 922 USD came to sit against 624 USD of sales.
   *
   * A warning, not a block: overpaying is a real thing a customer does, and a
   * deposit against future work is not a mistake. This only says what the
   * books will show, and leaves the decision alone.
   */
  const outstandingInWalletCurrency = isFxWallet
    ? outstandingByCurrency?.find(
        (row) => row.currency === selectedAccount?.currency,
      )?.minor ?? null
    : null;
  const paysAhead =
    !nativeOnlyPayment &&
    isFxWallet &&
    forexMinor !== null &&
    forexMinor > 0 &&
    outstandingInWalletCurrency !== null &&
    forexMinor > outstandingInWalletCurrency;
  const creditAfterPayment =
    paysAhead && outstandingInWalletCurrency !== null
      ? forexMinor! - outstandingInWalletCurrency
      : 0;

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
            {/* Named in the currency it was agreed in: that is the sum the
                customer will hand over, while the lira figure beside it moves
                with the rate until they do. */}
            {forexSummary && <>{` — ${forexSummary}`}</>}
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
        {/* Deliberately not a ValidationHint and not wired to submitBlocked:
            those mean "you cannot do this", and this is allowed. It states
            the consequence and gets out of the way. */}
        {paysAhead && selectedAccount?.currency && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            That is more than{" "}
            {formatFxNative(
              outstandingInWalletCurrency ?? 0,
              selectedAccount.currency,
            )}{" "}
            outstanding in {selectedAccount.currency}. Recording it leaves the
            customer{" "}
            {formatFxNative(creditAfterPayment, selectedAccount.currency)} paid
            ahead. Fine if that is a deposit — worth a second look if it is a
            typo.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={submitting || submitBlocked}>
          {submitting ? "Recording…" : "Record payment"}
        </Button>
      </form>
    </FormDialogShell>
  );
}
