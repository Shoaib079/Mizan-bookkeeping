"use client";

import { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Combobox } from "@/components/ui/combobox";
import { Input, Label } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { ValidationHint } from "@/components/ui/validation-hint";
import { formatFxNative } from "@/lib/fx-money";
import {
  paymentReceiveAccountLabel,
  type MoneyAccountOption,
} from "@/lib/load-money-accounts";
import { formatTry } from "@/lib/money";

type SelectedAccount = MoneyAccountOption | undefined;

type Props = {
  onSubmit: (event: FormEvent) => void;
  dateText: string;
  onDateTextChange: (value: string) => void;
  balanceKurus?: number;
  isFxReceivable: boolean;
  forexSummary: string | null;
  remainingForexMinor?: number | null;
  forexReceivableCurrency?: string | null;
  paymentGlAccountId: string;
  onPaymentGlAccountIdChange: (value: string) => void;
  accounts: MoneyAccountOption[];
  isFxWallet: boolean;
  selectedAccount: SelectedAccount;
  forexAmountText: string;
  onForexAmountTextChange: (value: string) => void;
  forexInvalid: boolean;
  overNativeBalance: boolean;
  forexMinor: number | null;
  nativeOnlyPayment: boolean;
  rateText: string;
  onRateTextChange: (value: string) => void;
  amountText: string;
  onAmountTextChange: (value: string) => void;
  onTryValueTouched: () => void;
  amountInvalid: boolean;
  overBalance: boolean;
  description: string;
  onDescriptionChange: (value: string) => void;
  paysAhead: boolean;
  outstandingInWalletCurrency: number | null;
  creditAfterPayment: number;
  error: string | null;
  submitting: boolean;
  submitBlocked: boolean;
  accountPlaceholder?: string;
};

export function CustomerPaymentFields({
  onSubmit,
  dateText,
  onDateTextChange,
  balanceKurus,
  isFxReceivable,
  forexSummary,
  remainingForexMinor,
  forexReceivableCurrency,
  paymentGlAccountId,
  onPaymentGlAccountIdChange,
  accounts,
  isFxWallet,
  selectedAccount,
  forexAmountText,
  onForexAmountTextChange,
  forexInvalid,
  overNativeBalance,
  forexMinor,
  nativeOnlyPayment,
  rateText,
  onRateTextChange,
  amountText,
  onAmountTextChange,
  onTryValueTouched,
  amountInvalid,
  overBalance,
  description,
  onDescriptionChange,
  paysAhead,
  outstandingInWalletCurrency,
  creditAfterPayment,
  error,
  submitting,
  submitBlocked,
  accountPlaceholder = "Bank, cash, or FX wallet…",
}: Props) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="cp-date">Payment date (DD.MM.YYYY)</Label>
        <DateInput
          id="cp-date"
          value={dateText}
          onChange={onDateTextChange}
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
          onValueChange={onPaymentGlAccountIdChange}
          options={accounts.map((a) => ({
            value: a.gl_account_id,
            label: paymentReceiveAccountLabel(a),
          }))}
          placeholder={accountPlaceholder}
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
            onChange={(e) => onForexAmountTextChange(e.target.value)}
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
              TRY carrying value is calculated from the sale — no payment-date
              rate.
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
              onChange={onRateTextChange}
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
            {isFxWallet
              ? "TRY book value (reduces receivable)"
              : "Amount (TRY)"}
          </Label>
          <MoneyInput
            id="cp-amount"
            value={amountText}
            onChange={(value) => {
              onTryValueTouched();
              onAmountTextChange(value);
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
              Amount cannot exceed outstanding receivable (
              {formatTry(balanceKurus)}).
            </ValidationHint>
          )}
        </div>
      )}
      <div>
        <Label htmlFor="cp-desc">Description</Label>
        <Input
          id="cp-desc"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
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
  );
}
