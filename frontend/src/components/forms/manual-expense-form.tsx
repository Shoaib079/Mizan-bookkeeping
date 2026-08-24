"use client";

/** Manual expense dialog — autosave draft + discard confirm (DESIGN_SYSTEM §10, Slice 10.7). */

import { ManualExpenseFields } from "@/components/forms/manual-expense-fields";
import { ManualExpenseSalaryPanel } from "@/components/forms/manual-expense-salary-panel";
import { useManualExpenseForm } from "@/components/forms/use-manual-expense-form";
import { RecordingForBanner } from "@/components/forms/recording-for-banner";
import {
  ExpenseRecordKindToggle,
  type ExpenseRecordKind,
} from "@/components/expenses/expense-record-kind-toggle";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { ResumeDraftBanner } from "@/components/ui/resume-draft-banner";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** When set, opens in salary or expense mode. */
  defaultRecordKind?: ExpenseRecordKind;
  /** Hide in-dialog expense/salary toggle (e.g. when mode is fixed externally). */
  showRecordKindToggle?: boolean;
  embedded?: boolean;
  onSaved?: () => void;
};

export function ManualExpenseForm({
  open,
  onClose,
  title = "Daily expenses",
  defaultRecordKind = "expense",
  showRecordKindToggle = true,
  embedded = false,
  onSaved,
}: Props) {
  const s = useManualExpenseForm({ open, defaultRecordKind, onSaved });
  const allowSalaryMode = showRecordKindToggle;
  const dialogTitle =
    s.recordKind === "salary" ? "Record salary payment" : title;
  const DuplicateRecordDialog = s.DuplicateRecordDialog;

  if (!open) return null;

  const formBody = (
    <>
      {!embedded && <RecordingForBanner />}
      {s.recordKind === "expense" && !embedded && (
        <p className="mb-4 text-xs text-muted-foreground">
          Cash and partner paid only — bank and card charges are classified
          when the bank statement arrives (never record them here).
        </p>
      )}
      {s.recordKind === "expense" && s.resumeDraft && (
        <ResumeDraftBanner
          onResume={s.handleResume}
          onDismiss={s.handleDeclineResume}
        />
      )}
      {!embedded && (
        <div className="mb-4">
          <Label htmlFor="exp-date">Date (DD.MM.YYYY)</Label>
          <DateInput
            id="exp-date"
            value={s.dateText}
            onChange={s.setDateText}
            required
          />
        </div>
      )}
      {allowSalaryMode && (
        <ExpenseRecordKindToggle
          value={s.recordKind}
          onChange={s.setRecordKind}
          className={embedded ? "mb-2" : "mb-4"}
        />
      )}

      {s.recordKind === "salary" ? (
        <ManualExpenseSalaryPanel
          embedded={embedded}
          entityId={s.entityId}
          employees={s.employees}
          employeeId={s.employeeId}
          setEmployeeId={s.setEmployeeId}
          selectedEmployee={s.selectedEmployee}
          dateText={s.dateText}
          setDateText={s.setDateText}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : (
        <ManualExpenseFields
          layout={embedded ? "embedded" : "dialog"}
          entityId={s.entityId ?? ""}
          submitting={s.submitting}
          error={s.error}
          itemName={s.itemName}
          confirmExpenseItemId={s.confirmExpenseItemId}
          onItemNameChange={s.handleItemNameChange}
          onPickItem={s.handlePickExpenseItem}
          amountText={s.amountText}
          setAmountText={s.setAmountText}
          dateText={s.dateText}
          setDateText={s.setDateText}
          expenseAccounts={s.expenseAccounts}
          setExpenseAccounts={s.setExpenseAccounts}
          expenseAccountId={s.expenseAccountId}
          setExpenseAccountId={s.setExpenseAccountId}
          suggestedAccountId={s.suggestedAccountId}
          suggestedSource={s.suggestedSource}
          markAccountPickedByUser={s.markAccountPickedByUser}
          paymentMode={s.paymentMode}
          setPaymentMode={s.setPaymentMode}
          showCashDrawerPicker={s.showCashDrawerPicker}
          cashAccounts={s.cashAccounts}
          moneyAccountId={s.moneyAccountId}
          setMoneyAccountId={s.setMoneyAccountId}
          partners={s.partners}
          partnerId={s.partnerId}
          setPartnerId={s.setPartnerId}
          notes={s.notes}
          setNotes={s.setNotes}
          markTouched={s.markTouched}
          onSubmit={s.onSubmit}
        />
      )}
    </>
  );

  return (
    <>
      {embedded ? (
        formBody
      ) : (
        <Dialog
          open={open}
          title={dialogTitle}
          onClose={onClose}
          dirty={s.recordKind === "expense" ? s.dirty : false}
          onDiscard={s.recordKind === "expense" ? s.handleDiscard : undefined}
        >
          {formBody}
        </Dialog>
      )}
      <DuplicateRecordDialog />
    </>
  );
}
