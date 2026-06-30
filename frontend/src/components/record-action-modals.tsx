"use client";

/** All record-action modals — shared by New menu, command palette, and Record hub. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { BankAccountPickerDialog } from "@/components/record/bank-account-picker-dialog";
import { FxWalletActionDialog } from "@/components/record/fx-wallet-action-dialog";
import { PeopleRecordDialog } from "@/components/record/people-record-dialog";
import { CardSalesForm } from "@/components/forms/card-sales-form";
import { CashDrawerCloseDayForm } from "@/components/forms/cash-drawer-close-day-form";
import { CashMovementForm } from "@/components/forms/cash-movement-form";
import { ClearCommissionForm } from "@/components/forms/clear-commission-form";
import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
import { EfaturaUploadForm } from "@/components/forms/efatura-upload-form";
import { ExpenseReceiptUploadForm } from "@/components/forms/expense-receipt-upload-form";
import { FxPurchaseQuickAction } from "@/components/forms/fx-purchase-quick-action";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import { PosSettlementForm } from "@/components/forms/pos-settlement-form";
import { PosSummaryUploadForm } from "@/components/forms/pos-summary-upload-form";
import { SupplierForm } from "@/components/forms/supplier-form";
import { TransferForm } from "@/components/forms/transfer-form";
import { isEntitySettingEnabled } from "@/lib/entity-settings";
import { useEntity } from "@/lib/entity-context";
import {
  PERSON_PICKER_ACTIONS,
  recordActionById,
  type RecordActionKey,
} from "@/lib/record-actions";
import { useEntityAccess } from "@/lib/use-entity-access";

type Props = {
  active: RecordActionKey | null;
  onClose: () => void;
};

export function RecordActionModals({ active, onClose }: Props) {
  const { entityId } = useEntity();
  const { canWriteOperations } = useEntityAccess();
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);

  useEffect(() => {
    if (!entityId) {
      setDeliveryEnabled(false);
      return;
    }
    void isEntitySettingEnabled(entityId, "delivery_enabled")
      .then(setDeliveryEnabled)
      .catch(() => setDeliveryEnabled(false));
  }, [entityId]);

  const closeAll = useCallback(() => {
    onClose();
  }, [onClose]);

  const personAction = useMemo((): RecordActionKey | null => {
    if (!active || !PERSON_PICKER_ACTIONS.has(active)) return null;
    return active;
  }, [active]);

  const modalAction = useMemo((): RecordActionKey | null => {
    if (!active || PERSON_PICKER_ACTIONS.has(active)) return null;
    return active;
  }, [active]);

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

      <ManualExpenseForm open={modalAction === "expense"} onClose={closeAll} />
      <ManualDailySalesForm open={modalAction === "sales"} onClose={closeAll} />
      <FxPurchaseQuickAction open={modalAction === "buyFx"} onClose={closeAll} />
      <PosSummaryUploadForm open={modalAction === "posPhoto"} onClose={closeAll} />
      {deliveryEnabled && (
        <DeliveryReportForm
          open={modalAction === "deliveryReport"}
          onClose={closeAll}
        />
      )}
      <ExpenseReceiptUploadForm open={modalAction === "receipt"} onClose={closeAll} />
      <SupplierForm open={modalAction === "supplier"} onClose={closeAll} />
      <EfaturaUploadForm open={modalAction === "efatura"} onClose={closeAll} />

      <CashDrawerCloseDayForm open={modalAction === "closeDay"} onClose={closeAll} />
      <CashMovementForm open={modalAction === "cashMovement"} onClose={closeAll} />
      <TransferForm open={modalAction === "transfer"} onClose={closeAll} />
      <FxWalletActionDialog
        open={modalAction === "fxConvert"}
        mode="convert"
        onClose={closeAll}
      />
      <FxWalletActionDialog
        open={modalAction === "fxSpend"}
        mode="spend"
        onClose={closeAll}
      />
      <BankAccountPickerDialog
        open={modalAction === "bankStatement"}
        onClose={closeAll}
      />

      <CardSalesForm open={modalAction === "cardSalesBatch"} onClose={closeAll} />
      <PosSettlementForm open={modalAction === "posSettlement"} onClose={closeAll} />
      <ClearCommissionForm
        open={modalAction === "clearCommission"}
        onClose={closeAll}
      />
    </>
  );
}
