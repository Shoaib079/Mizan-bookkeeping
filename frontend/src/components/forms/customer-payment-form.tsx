"use client";

import { CustomerPaymentFields } from "@/components/forms/customer-payment-fields";
import {
  useCustomerPaymentForm,
  type CustomerPaymentFormProps,
} from "@/components/forms/use-customer-payment-form";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";

export type { CustomerPaymentFormProps };

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
  cashOnly,
}: CustomerPaymentFormProps) {
  const s = useCustomerPaymentForm({
    open,
    onClose,
    customerId,
    balanceKurus,
    outstandingByCurrency,
    groupSaleId,
    forexReceivableCurrency,
    remainingForexMinor,
    onSaved,
    cashOnly,
  });

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title="Record customer payment"
      onClose={onClose}
    >
      <CustomerPaymentFields
        onSubmit={s.onSubmit}
        dateText={s.dateText}
        onDateTextChange={s.setDateText}
        balanceKurus={s.balanceKurus}
        isFxReceivable={s.isFxReceivable}
        forexSummary={s.forexSummary}
        remainingForexMinor={s.remainingForexMinor}
        forexReceivableCurrency={s.forexReceivableCurrency}
        paymentGlAccountId={s.paymentGlAccountId}
        onPaymentGlAccountIdChange={s.setPaymentGlAccountId}
        accounts={s.accounts}
        isFxWallet={s.isFxWallet}
        selectedAccount={s.selectedAccount}
        forexAmountText={s.forexAmountText}
        onForexAmountTextChange={s.setForexAmountText}
        forexInvalid={s.forexInvalid}
        overNativeBalance={s.overNativeBalance}
        forexMinor={s.forexMinor}
        nativeOnlyPayment={s.nativeOnlyPayment}
        rateText={s.rateText}
        onRateTextChange={s.setRateText}
        amountText={s.amountText}
        onAmountTextChange={s.setAmountText}
        onTryValueTouched={() => s.setTryValueTouched(true)}
        amountInvalid={s.amountInvalid}
        overBalance={s.overBalance}
        description={s.description}
        onDescriptionChange={s.setDescription}
        paysAhead={s.paysAhead}
        outstandingInWalletCurrency={s.outstandingInWalletCurrency}
        creditAfterPayment={s.creditAfterPayment}
        error={s.error}
        submitting={s.submitting}
        submitBlocked={s.submitBlocked}
        accountPlaceholder={
          cashOnly ? "Cash drawer…" : "Bank, cash, or FX wallet…"
        }
      />
    </FormDialogShell>
  );
}
