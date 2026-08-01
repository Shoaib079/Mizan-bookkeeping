"use client";

/** All record-action modals — shared by New menu, command palette, and Record hub. */

import { useCallback, useMemo } from "react";

import { BankAccountPickerDialog } from "@/components/record/bank-account-picker-dialog";
import { FxUnifiedDialog, type FxUnifiedMode } from "@/components/record/fx-unified-dialog";
import { PeopleRecordDialog } from "@/components/record/people-record-dialog";
import {
  AddDocumentDialog,
  type DetectedDocumentType,
} from "@/components/forms/add-document-dialog";
import { CardSalesForm } from "@/components/forms/card-sales-form";
import { CashDrawerCloseDayForm } from "@/components/forms/cash-drawer-close-day-form";
import { CashMovementForm } from "@/components/forms/cash-movement-form";
import { ClearCommissionForm } from "@/components/forms/clear-commission-form";
import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
import { EfaturaUploadForm } from "@/components/forms/efatura-upload-form";
import { ExpenseReceiptUploadForm } from "@/components/forms/expense-receipt-upload-form";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import { TransferForm } from "@/components/forms/transfer-form";
import { PartnerProfitAllocationForm } from "@/components/forms/partner-profit-allocation-form";
import { PosSettlementForm } from "@/components/forms/pos-settlement-form";
import { PosSummaryUploadForm } from "@/components/forms/pos-summary-upload-form";
import { SupplierForm } from "@/components/forms/supplier-form";
import { useQuickActions } from "@/components/quick-actions";
import {
  PERSON_PICKER_ACTIONS,
  recordActionById,
  type RecordActionKey,
} from "@/lib/record-actions";
import { useEntityAccess } from "@/lib/use-entity-access";

type Props = {
  active: RecordActionKey | null;
  onClose: () => void;
  routedFile?: File | null;
  routedTo?: RecordActionKey | null;
};

export function RecordActionModals({
  active,
  onClose,
  routedFile = null,
  routedTo = null,
}: Props) {
  const { canWriteOperations } = useEntityAccess();
  const { deliveryEnabled, openRecordAction, openRecordActionWithFile } =
    useQuickActions();

  const closeAll = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleDocumentConfirm = useCallback(
    (type: DetectedDocumentType, file: File) => {
      const actionMap: Record<DetectedDocumentType, RecordActionKey> = {
        invoice: "efatura",
        bank_statement: "bankStatement",
        expense_receipt: "receipt",
        pos_daily_summary: "posPhoto",
      };
      openRecordActionWithFile(actionMap[type], file);
    },
    [openRecordActionWithFile],
  );

  const personAction = useMemo((): RecordActionKey | null => {
    if (!active || !PERSON_PICKER_ACTIONS.has(active)) return null;
    return active;
  }, [active]);

  const modalAction = useMemo((): RecordActionKey | null => {
    if (!active || PERSON_PICKER_ACTIONS.has(active)) return null;
    return active;
  }, [active]);

  const effectiveModal = routedTo ?? modalAction;

  const fxInitialMode = useMemo((): FxUnifiedMode => {
    if (effectiveModal === "fxConvert") return "convert";
    if (effectiveModal === "fxSpend") return "spend";
    return "buy";
  }, [effectiveModal]);

  const fxOpen =
    effectiveModal === "fx" ||
    effectiveModal === "buyFx" ||
    effectiveModal === "fxConvert" ||
    effectiveModal === "fxSpend";

  if (!canWriteOperations) return null;

  return (
    <>
      {personAction && (
        <PeopleRecordDialog
          open
          action={personAction}
          title={recordActionById(personAction).label}
          kind={recordActionById(personAction).personKind!}
          onClose={closeAll}
        />
      )}

      <AddDocumentDialog
        open={modalAction === "addDocument"}
        onClose={closeAll}
        onConfirm={handleDocumentConfirm}
        deliveryEnabled={deliveryEnabled}
        onOpenDeliveryReport={() => {
          openRecordAction("deliveryReport");
        }}
      />

      <ManualDailySalesForm open={effectiveModal === "sales"} onClose={closeAll} />
      <TransferForm open={effectiveModal === "transfer"} onClose={closeAll} />
      <ManualExpenseForm
        open={effectiveModal === "expense"}
        onClose={closeAll}
        defaultRecordKind="expense"
        showRecordKindToggle={false}
      />
      <ManualExpenseForm
        open={effectiveModal === "staffSalary"}
        onClose={closeAll}
        title="Staff salary"
        defaultRecordKind="salary"
        showRecordKindToggle={false}
      />
      <FxUnifiedDialog
        open={fxOpen}
        initialMode={fxInitialMode}
        onClose={closeAll}
      />
      <PosSummaryUploadForm
        open={effectiveModal === "posPhoto"}
        onClose={closeAll}
        initialFile={routedTo === "posPhoto" ? routedFile ?? undefined : undefined}
      />
      {deliveryEnabled && (
        <DeliveryReportForm
          open={effectiveModal === "deliveryReport"}
          onClose={closeAll}
        />
      )}
      <ExpenseReceiptUploadForm
        open={effectiveModal === "receipt"}
        onClose={closeAll}
        initialFile={routedTo === "receipt" ? routedFile ?? undefined : undefined}
      />
      <SupplierForm open={effectiveModal === "supplier"} onClose={closeAll} />
      <EfaturaUploadForm
        open={effectiveModal === "efatura"}
        onClose={closeAll}
        initialFile={routedTo === "efatura" ? routedFile ?? undefined : undefined}
      />

      <CashDrawerCloseDayForm open={effectiveModal === "closeDay"} onClose={closeAll} />
      <CashMovementForm open={effectiveModal === "cashMovement"} onClose={closeAll} />
      <BankAccountPickerDialog
        open={effectiveModal === "bankStatement"}
        onClose={closeAll}
        initialFile={
          routedTo === "bankStatement" ? routedFile ?? undefined : undefined
        }
      />

      <CardSalesForm open={effectiveModal === "cardSalesBatch"} onClose={closeAll} />
      <PosSettlementForm open={effectiveModal === "posSettlement"} onClose={closeAll} />
      <ClearCommissionForm
        open={effectiveModal === "clearCommission"}
        onClose={closeAll}
      />
      <PartnerProfitAllocationForm
        open={effectiveModal === "partnerProfitAllocation"}
        onClose={closeAll}
      />
    </>
  );
}
