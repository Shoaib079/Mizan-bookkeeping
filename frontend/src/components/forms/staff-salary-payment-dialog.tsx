"use client";

/** Pay salary for a month — one dialog: date, account, period, amounts. */

import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { StaffSalaryFxPaymentFields } from "@/components/forms/staff-salary-fx-payment-fields";
import { StaffSalaryFundingFields } from "@/components/forms/staff-salary-funding-fields";
import { StaffSalaryPeriodAmounts } from "@/components/forms/staff-salary-period-amounts";
import { StaffSalarySettlePreview } from "@/components/forms/staff-salary-settle-preview";
import { useStaffSalaryPayment } from "@/components/forms/use-staff-salary-payment";
import type { PeriodPayload } from "@/lib/staff-salary-payment-submit";

type Props = {
  open: boolean;
  onClose: () => void;
  entityId: string;
  employeeId: string;
  employeeName: string;
  payCurrency: string;
  /** Staff page: date + account in dialog. Statement: bank line only. */
  source?: "staff" | "statement";
  /** Inline in PeopleRecordDialog — no nested modal. */
  embedded?: boolean;
  /** ISO date — default for statement or initial staff date. */
  paymentDate?: string;
  /** Parent owns date (e.g. Expenses salary mode) — field hidden, date not reset on employee change. */
  hidePaymentDate?: boolean;
  defaultCashMinor?: number;
  lockCashAmount?: boolean;
  onConfirm?: (payload: PeriodPayload) => void | Promise<void>;
  onSaved?: () => void;
  /** When false, dialog stays open after a successful post (e.g. Expenses hub). */
  closeOnSuccess?: boolean;
  confirming?: boolean;
};

export function StaffSalaryPaymentDialog({
  open,
  onClose,
  entityId,
  employeeId,
  employeeName,
  payCurrency,
  source = "staff",
  embedded,
  paymentDate,
  hidePaymentDate = false,
  defaultCashMinor,
  lockCashAmount = false,
  onConfirm,
  onSaved,
  closeOnSuccess = true,
  confirming: confirmingProp = false,
}: Props) {
  const s = useStaffSalaryPayment({
    open,
    onClose,
    entityId,
    employeeId,
    employeeName,
    payCurrency,
    source,
    paymentDate,
    hidePaymentDate,
    defaultCashMinor,
    lockCashAmount,
    onConfirm,
    onSaved,
    closeOnSuccess,
    confirmingProp,
  });
  const {
    isTry,
    isStatement,
    dialogOpen,
    dialogTitle,
    confirming,
    dateText,
    setDateText,
    description,
    setDescription,
    tryAccounts,
    paymentGlAccountId,
    setPaymentGlAccountId,
    fundingMode,
    setFundingMode,
    partners,
    partnerId,
    setPartnerId,
    fxAccounts,
    fxWalletId,
    setFxWalletId,
    tryCostText,
    setTryCostText,
    periodYear,
    setPeriodYear,
    periodMonth,
    setPeriodMonth,
    salaryText,
    setSalaryText,
    cashText,
    setCashText,
    extraDaysText,
    setExtraDaysText,
    extraDayRateText,
    setExtraDayRateText,
    extraDaysInvalid,
    extraDaysTotalMinor,
    status,
    loading,
    error,
    formatMinor,
    handleSubmit,
    DuplicateRecordDialog,
    periodRemaining,
    outstandingAdvance,
    owedPreview,
    cashPreview,
    advancePreview,
    payablePreview,
    excessPreview,
    suggestedNet,
    settlePreviewActive,
  } = s;

  if (!dialogOpen) return null;

  const form = (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
      {!isStatement && !hidePaymentDate && (
        <div>
          <Label htmlFor="pay-date">Payment date (DD.MM.YYYY)</Label>
          <DateInput
            id="pay-date"
            value={dateText}
            onChange={setDateText}
            required
          />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Accrues this month&apos;s salary when needed. Cash defaults to net to
        pay (owed minus advance). Paying more than owed parks the rest as
        advance.
      </p>

      {!isStatement && !hidePaymentDate && (
        <div>
          <Label htmlFor="pay-desc">Note (optional)</Label>
          <Input
            id="pay-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      )}

      {!isStatement &&
        (isTry ? (
          <StaffSalaryFundingFields
            fundingMode={fundingMode}
            onFundingModeChange={setFundingMode}
            tryAccounts={tryAccounts}
            paymentGlAccountId={paymentGlAccountId}
            onPaymentGlAccountIdChange={setPaymentGlAccountId}
            partners={partners}
            partnerId={partnerId}
            onPartnerIdChange={setPartnerId}
            showAccountRequiredHint={cashPreview <= 0}
          />
        ) : (
          <StaffSalaryFxPaymentFields
            payCurrency={payCurrency}
            fxAccounts={fxAccounts}
            fxWalletId={fxWalletId}
            onFxWalletIdChange={setFxWalletId}
            tryCostText={tryCostText}
            onTryCostTextChange={setTryCostText}
          />
        ))}

      {isStatement && cashPreview > 0 && (
        <p className="text-xs text-muted-foreground">
          Payment posts from this bank statement — no cash or bank pick needed.
        </p>
      )}

      <StaffSalaryPeriodAmounts
        isTry={isTry}
        payCurrency={payCurrency}
        periodYear={periodYear}
        setPeriodYear={setPeriodYear}
        periodMonth={periodMonth}
        setPeriodMonth={setPeriodMonth}
        salaryText={salaryText}
        setSalaryText={setSalaryText}
        cashText={cashText}
        setCashText={setCashText}
        lockCashAmount={lockCashAmount}
        suggestedNet={suggestedNet}
        extraDaysText={extraDaysText}
        setExtraDaysText={setExtraDaysText}
        extraDayRateText={extraDayRateText}
        setExtraDayRateText={setExtraDayRateText}
        extraDaysInvalid={extraDaysInvalid}
        extraDaysTotalMinor={extraDaysTotalMinor}
      />

      <StaffSalarySettlePreview
        status={status}
        loading={loading}
        error={error}
        periodRemaining={periodRemaining}
        outstandingAdvance={outstandingAdvance}
        owedPreview={owedPreview}
        cashPreview={cashPreview}
        advancePreview={advancePreview}
        payablePreview={payablePreview}
        excessPreview={excessPreview}
        suggestedNet={suggestedNet}
        settlePreviewActive={settlePreviewActive}
        formatMinor={formatMinor}
      />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={confirming}>
          Cancel
        </Button>
        <Button type="submit" disabled={confirming || loading}>
          {confirming
            ? "Posting…"
            : cashPreview > 0
              ? "Post salary payment"
              : "Record"}
        </Button>
      </div>
    </form>
  );

  if (embedded) {
    return (
      <>
        <div className="space-y-3">
          <h3 className="text-base font-semibold">{dialogTitle}</h3>
          {form}
        </div>
        <DuplicateRecordDialog />
      </>
    );
  }

  return (
    <>
      <Dialog
        open={dialogOpen}
        title={dialogTitle}
        onClose={onClose}
        className="max-w-lg"
      >
        {form}
      </Dialog>
      <DuplicateRecordDialog />
    </>
  );
}
