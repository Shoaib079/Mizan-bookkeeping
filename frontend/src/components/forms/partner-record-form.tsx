"use client";

import { PartnerRecordFields } from "@/components/forms/partner-record-fields";
import type {
  PartnerRecordFormProps,
  PartnerRecordKind,
} from "@/components/forms/partner-record-types";
import { usePartnerRecordForm } from "@/components/forms/use-partner-record-form";
import { FormDialogShell } from "@/components/ui/form-dialog-shell";

export type { PartnerRecordKind, PartnerRecordFormProps };

export function PartnerRecordForm({
  open,
  onClose,
  partnerId,
  netBalanceKurus,
  unpaidProfitKurus = 0,
  drawingsNetKurus = 0,
  lockedKind,
  embedded,
  onSaved,
}: PartnerRecordFormProps) {
  const form = usePartnerRecordForm({
    open,
    onClose,
    partnerId,
    unpaidProfitKurus,
    drawingsNetKurus,
    lockedKind,
    onSaved,
  });

  return (
    <FormDialogShell
      embedded={embedded}
      open={open}
      title={form.dialogTitle}
      onClose={onClose}
    >
      <form onSubmit={form.onSubmit} className="space-y-3">
        <PartnerRecordFields
          lockedKind={lockedKind}
          kind={form.kind}
          onKindChange={form.setKind}
          kindOptions={form.kindOptions}
          netBalanceKurus={netBalanceKurus}
          unpaidProfitKurus={form.unpaidProfitKurus}
          canReturn={form.canReturn}
          outstandingDrawingKurus={form.outstandingDrawingKurus}
          dateText={form.dateText}
          onDateChange={form.setDateText}
          amountText={form.amountText}
          onAmountChange={form.setAmountText}
          description={form.description}
          onDescriptionChange={form.setDescription}
          accounts={form.accounts}
          cashAccountId={form.cashAccountId}
          onDrawerChange={form.onDrawerChange}
          error={form.error}
          submitting={form.submitting}
          submitLabel={form.submitLabel}
        />
      </form>
    </FormDialogShell>
  );
}
