"use client";

/** State, load, validation, and submit for CustomerPaymentForm. */

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch } from "@/lib/api";
import { todayTrDate } from "@/lib/dates";
import { useEntity } from "@/lib/entity-context";
import {
  formatForexBalanceSummary,
  parseFxNative,
} from "@/lib/fx-money";
import { computeTryCostKurusFromRate } from "@/lib/fx-purchase-helpers";
import {
  loadCashAccounts,
  loadPaymentReceiveAccounts,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { formatKurus, parseTrDate, parseTryToKurus } from "@/lib/money";
import { useSubmitIdempotency } from "@/lib/use-submit-idempotency";
import { useToast } from "@/lib/toast";

export type CustomerPaymentFormProps = {
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
  /** Cash drawers only — bank/FX receipts come from statements / FX flows. */
  cashOnly?: boolean;
};

export function useCustomerPaymentForm({
  open,
  onClose,
  customerId,
  balanceKurus,
  outstandingByCurrency,
  groupSaleId,
  forexReceivableCurrency,
  remainingForexMinor,
  onSaved,
  cashOnly = false,
}: Omit<CustomerPaymentFormProps, "embedded">) {
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
    if (cashOnly && !isFxReceivable) {
      const cash = await loadCashAccounts(entityId);
      setAccounts(cash);
      if (cash[0]) setPaymentGlAccountId(cash[0].gl_account_id);
      return;
    }
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
  }, [entityId, isFxReceivable, forexReceivableCurrency, cashOnly]);

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
      const recorded = await apiFetch<{ warnings?: string[] }>(
        `/entities/${entityId}/customers/${customerId}/payments`,
        {
          method: "POST",
          idempotencyKey,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      // The API decides against the balance as it stood a moment ago, which
      // the form's own pre-submit warning cannot: the outstanding figure it
      // compares against was fetched when the page loaded. Shown after the
      // fact because the payment is already recorded — this reports, it does
      // not ask.
      for (const warning of recorded?.warnings ?? []) {
        toast(warning, "warning");
      }
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

  return {
    accounts,
    paymentGlAccountId,
    setPaymentGlAccountId,
    dateText,
    setDateText,
    amountText,
    setAmountText,
    setTryValueTouched,
    forexAmountText,
    setForexAmountText,
    rateText,
    setRateText,
    description,
    setDescription,
    error,
    submitting,
    selectedAccount,
    isFxReceivable,
    isFxWallet,
    balanceKurus,
    forexReceivableCurrency,
    remainingForexMinor,
    forexSummary,
    amountInvalid,
    forexInvalid,
    overBalance,
    nativeOnlyPayment,
    overNativeBalance,
    submitBlocked,
    outstandingInWalletCurrency,
    paysAhead,
    creditAfterPayment,
    forexMinor,
    onSubmit,
  };
}
