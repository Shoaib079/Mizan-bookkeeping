"use client";

/** Close day — post counted total + over/short, lock day, optional send. */

import { type ReactNode } from "react";

import { CashCloseDayDone } from "@/components/forms/cash-close-day-done";
import { CashCloseDayFormBody } from "@/components/forms/cash-close-day-form-body";
import { CashDrawerSplitPanel } from "@/components/forms/cash-drawer-split-panel";
import { useCashDrawerCloseDay } from "@/components/forms/use-cash-drawer-close-day";
import { Dialog } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
  defaultCashAccountId?: string;
  defaultSessionDate?: string;
  onClosed?: () => void;
  onDraftChange?: (hasDraft: boolean) => void;
};

export function CashDrawerCloseDayForm({
  open,
  onClose,
  embedded = false,
  defaultCashAccountId: _ignoredCashAccountId,
  defaultSessionDate,
  onClosed,
  onDraftChange,
}: Props) {
  void _ignoredCashAccountId;
  const s = useCashDrawerCloseDay({
    open,
    defaultSessionDate,
    onClosed,
    onDraftChange,
  });
  const { PeriodUnlockDialog, phase } = s;

  if (!open) return null;

  let formBody: ReactNode;

  if (phase.kind === "split") {
    formBody = (
      <CashDrawerSplitPanel
        fromAccountId={phase.moneyAccountId}
        fromAccountName={phase.moneyAccountName}
        sessionDate={phase.sessionDateDisplay}
        cashAccounts={s.cashAccounts}
        onKeepHere={s.keepCashHere}
        onDone={s.finishAfterSend}
      />
    );
  } else if (phase.kind === "done") {
    formBody = (
      <CashCloseDayDone
        moneyAccountName={phase.moneyAccountName}
        leftKurus={phase.leftKurus}
        sentKurus={phase.sentKurus}
        destLabel={phase.destLabel}
        embedded={embedded}
        onCloseAnotherDay={s.prepareFreshClose}
        onClose={onClose}
      />
    );
  } else {
    formBody = (
      <CashCloseDayFormBody
        usingSavedCount={s.usingSavedCount}
        draftActive={s.draftActive}
        onDiscardDraft={s.discardDraft}
        dateText={s.dateText}
        onDateTextChange={s.setDateText}
        tillAccount={s.tillAccount}
        homeAccount={s.homeAccount}
        expectedKurus={s.expectedKurus}
        useNotes={s.useNotes}
        onToggleUseNotes={s.toggleUseNotes}
        quantities={s.quantities}
        onQuantitiesChange={s.setQuantities}
        onClearDenominations={s.clearDenominations}
        countedText={s.countedText}
        onCountedTextChange={s.setCountedText}
        noteLinesLength={s.noteLines.length}
        overShortKurus={s.overShortKurus}
        description={s.description}
        onDescriptionChange={s.setDescription}
        error={s.error}
        confirmWarning={s.confirmWarning}
        onClearConfirmWarning={() => s.setConfirmWarning(null)}
        submitting={s.submitting}
        onSubmit={s.onSubmit}
        onConfirmLargeVariance={() => void s.submitClose(true)}
      />
    );
  }

  const dialogTitle =
    phase.kind === "form"
      ? "Close day"
      : phase.kind === "done"
        ? "Day closed"
        : "Send part home";

  if (embedded) {
    return (
      <>
        {formBody}
        <PeriodUnlockDialog />
      </>
    );
  }

  return (
    <>
      <Dialog
        open={open}
        title={dialogTitle}
        onClose={onClose}
        size="default"
      >
        {formBody}
      </Dialog>
      <PeriodUnlockDialog />
    </>
  );
}
