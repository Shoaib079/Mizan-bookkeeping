"use client";

/** All record-action modals — shared by New menu, command palette, and Record hub. */

import { useCallback, useEffect, useMemo, useState } from "react";

import { BankAccountPickerDialog } from "@/components/record/bank-account-picker-dialog";
import { FxWalletActionDialog } from "@/components/record/fx-wallet-action-dialog";
import {
  PersonPickerDialog,
  type PersonPickerResult,
} from "@/components/record/person-picker-dialog";
import { CardSalesForm } from "@/components/forms/card-sales-form";
import { CashDrawerCloseDayForm } from "@/components/forms/cash-drawer-close-day-form";
import { CashMovementForm } from "@/components/forms/cash-movement-form";
import { ClearCommissionForm } from "@/components/forms/clear-commission-form";
import { CustomerCreditSaleForm } from "@/components/forms/customer-credit-sale-form";
import { CustomerPaymentForm } from "@/components/forms/customer-payment-form";
import { DeliveryReportForm } from "@/components/forms/delivery-report-form";
import { EfaturaUploadForm } from "@/components/forms/efatura-upload-form";
import { ExpenseReceiptUploadForm } from "@/components/forms/expense-receipt-upload-form";
import { FxPurchaseQuickAction } from "@/components/forms/fx-purchase-quick-action";
import { ManualDailySalesForm } from "@/components/forms/manual-daily-sales-form";
import { ManualExpenseForm } from "@/components/forms/manual-expense-form";
import { PartnerExpenseFrontedForm } from "@/components/forms/partner-expense-fronted-form";
import { PartnerReimbursementForm } from "@/components/forms/partner-reimbursement-form";
import { PosSettlementForm } from "@/components/forms/pos-settlement-form";
import { PosSummaryUploadForm } from "@/components/forms/pos-summary-upload-form";
import { StaffAccrualForm } from "@/components/forms/staff-accrual-form";
import { StaffCashMovementForm } from "@/components/forms/staff-cash-movement-form";
import { SupplierForm } from "@/components/forms/supplier-form";
import { SupplierPaymentForm } from "@/components/forms/supplier-payment-form";
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
  const [personPickerFor, setPersonPickerFor] = useState<RecordActionKey | null>(
    null,
  );
  const [person, setPerson] = useState<PersonPickerResult | null>(null);

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
    setPersonPickerFor(null);
    setPerson(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!active) {
      setPersonPickerFor(null);
      setPerson(null);
      return;
    }
    if (PERSON_PICKER_ACTIONS.has(active)) {
      setPersonPickerFor(active);
      setPerson(null);
    }
  }, [active]);

  const personPickerKind = useMemo(() => {
    if (!personPickerFor) return null;
    return recordActionById(personPickerFor).personKind ?? null;
  }, [personPickerFor]);

  function handlePersonContinue(result: PersonPickerResult) {
    if (!personPickerFor) return;
    setPerson(result);
    setPersonPickerFor(null);
  }

  const effectiveAction = useMemo((): RecordActionKey | null => {
    if (!active) return null;
    if (PERSON_PICKER_ACTIONS.has(active)) {
      if (personPickerFor || !person) return null;
      return active;
    }
    return active;
  }, [active, person, personPickerFor]);

  if (!canWriteOperations) return null;

  const personPickerOpen = Boolean(personPickerFor && personPickerKind);

  return (
    <>
      <PersonPickerDialog
        open={personPickerOpen}
        kind={personPickerKind ?? "staff"}
        title={personPickerFor ? recordActionById(personPickerFor).label : ""}
        onClose={closeAll}
        onContinue={handlePersonContinue}
      />

      <ManualExpenseForm open={effectiveAction === "expense"} onClose={closeAll} />
      <ManualDailySalesForm open={effectiveAction === "sales"} onClose={closeAll} />
      <FxPurchaseQuickAction open={effectiveAction === "buyFx"} onClose={closeAll} />
      <PosSummaryUploadForm open={effectiveAction === "posPhoto"} onClose={closeAll} />
      {deliveryEnabled && (
        <DeliveryReportForm
          open={effectiveAction === "deliveryReport"}
          onClose={closeAll}
        />
      )}
      <ExpenseReceiptUploadForm open={effectiveAction === "receipt"} onClose={closeAll} />
      <SupplierForm open={effectiveAction === "supplier"} onClose={closeAll} />
      <EfaturaUploadForm open={effectiveAction === "efatura"} onClose={closeAll} />

      <CashDrawerCloseDayForm open={effectiveAction === "closeDay"} onClose={closeAll} />
      <CashMovementForm open={effectiveAction === "cashMovement"} onClose={closeAll} />
      <TransferForm open={effectiveAction === "transfer"} onClose={closeAll} />
      <FxWalletActionDialog
        open={effectiveAction === "fxConvert"}
        mode="convert"
        onClose={closeAll}
      />
      <FxWalletActionDialog
        open={effectiveAction === "fxSpend"}
        mode="spend"
        onClose={closeAll}
      />
      <BankAccountPickerDialog
        open={effectiveAction === "bankStatement"}
        onClose={closeAll}
      />

      <CardSalesForm open={effectiveAction === "cardSalesBatch"} onClose={closeAll} />
      <PosSettlementForm open={effectiveAction === "posSettlement"} onClose={closeAll} />
      <ClearCommissionForm
        open={effectiveAction === "clearCommission"}
        onClose={closeAll}
      />

      {person && effectiveAction && PERSON_PICKER_ACTIONS.has(effectiveAction) && (
        <>
          <StaffAccrualForm
            open={effectiveAction === "staffAccrual"}
            employeeId={person.id}
            payCurrency={person.payCurrency ?? "TRY"}
            onClose={closeAll}
          />
          <StaffCashMovementForm
            open={effectiveAction === "staffAdvance"}
            employeeId={person.id}
            kind="advance"
            payCurrency={person.payCurrency ?? "TRY"}
            onClose={closeAll}
          />
          <StaffCashMovementForm
            open={effectiveAction === "staffPayment"}
            employeeId={person.id}
            kind="payment"
            payCurrency={person.payCurrency ?? "TRY"}
            onClose={closeAll}
          />
          <PartnerExpenseFrontedForm
            open={effectiveAction === "partnerExpenseFronted"}
            partnerId={person.id}
            onClose={closeAll}
          />
          <PartnerReimbursementForm
            open={effectiveAction === "partnerReimbursement"}
            partnerId={person.id}
            balanceKurus={person.balanceKurus}
            onClose={closeAll}
          />
          <CustomerCreditSaleForm
            open={effectiveAction === "customerCreditSale"}
            customerId={person.id}
            onClose={closeAll}
          />
          <CustomerPaymentForm
            open={effectiveAction === "customerPayment"}
            customerId={person.id}
            balanceKurus={person.balanceKurus}
            onClose={closeAll}
          />
          <SupplierPaymentForm
            open={effectiveAction === "supplierPayment"}
            supplierId={person.id}
            balanceKurus={person.balanceKurus}
            onClose={closeAll}
          />
        </>
      )}
    </>
  );
}