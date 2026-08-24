"use client";

/** Record / correct a group sale — shell + compose. */

import { GroupSaleFormFooter } from "@/components/forms/group-sale-form-footer";
import { GroupSaleFormHeaderFields } from "@/components/forms/group-sale-form-header-fields";
import { GroupSaleFormLines } from "@/components/forms/group-sale-form-lines";
import { useGroupSaleForm } from "@/components/forms/use-group-sale-form";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";
import type { GroupSaleRead } from "@/lib/group-sales-types";

type Props = {
  open: boolean;
  onClose: () => void;
  /** When omitted, agency is chosen inside the form. */
  customerId?: string;
  /** When set, void-and-repost via correct endpoint. */
  correcting?: GroupSaleRead | null;
  embedded?: boolean;
  onSaved?: () => void;
};

export function GroupSaleForm({
  open,
  onClose,
  customerId,
  correcting,
  embedded,
  onSaved,
}: Props) {
  const s = useGroupSaleForm({
    open,
    onClose,
    customerId,
    correcting,
    onSaved,
  });
  const { DuplicateRecordDialog } = s;

  return (
    <>
      <FormDialogShell
        open={open}
        onClose={onClose}
        title={s.title}
        embedded={embedded}
      >
        <form onSubmit={s.onSubmit} className="space-y-4">
          <GroupSaleFormHeaderFields
            dateText={s.dateText}
            onDateTextChange={s.setDateText}
            showAgency={!customerId}
            customerOptions={s.customerOptions}
            selectedCustomerId={s.selectedCustomerId}
            onSelectedCustomerIdChange={s.setSelectedCustomerId}
            currency={s.currency}
            currencyOptions={s.currencyOptions}
            onCurrencyChange={s.setCurrency}
            isForex={s.isForex}
            fxRateText={s.fxRateText}
            onFxRateTextChange={s.setFxRateText}
            hasSaleDateRate={s.hasSaleDateRate}
          />
          <GroupSaleFormLines
            menus={s.menus}
            currency={s.currency}
            isForex={s.isForex}
            lines={s.lines}
            parsedLines={s.parsedLines}
            onUpdateLine={s.updateLine}
            onAddLine={s.addLine}
            onRemoveLine={s.removeLine}
          />
          <GroupSaleFormFooter
            currency={s.currency}
            isForex={s.isForex}
            totalMinor={s.totalMinor}
            fxRateKurus={s.fxRateKurus}
            totalTryPreview={s.totalTryPreview}
            fxRateText={s.fxRateText}
            note={s.note}
            onNoteChange={s.setNote}
            error={s.error}
            submitting={s.submitting}
            isCorrect={s.isCorrect}
            onClose={onClose}
          />
        </form>
      </FormDialogShell>
      <DuplicateRecordDialog />
    </>
  );
}
