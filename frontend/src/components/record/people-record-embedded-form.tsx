"use client";

/** Embedded money forms inside PeopleRecordDialog (one dialog, no Continue). */

import { GroupSaleForm } from "@/components/forms/group-sale-form";
import { CustomerPaymentForm } from "@/components/forms/customer-payment-form";
import { StaffAccrualForm } from "@/components/forms/staff-accrual-form";
import { StaffCashMovementForm } from "@/components/forms/staff-cash-movement-form";
import { StaffSalaryPaymentDialog } from "@/components/forms/staff-salary-payment-dialog";
import { SupplierPaymentForm } from "@/components/forms/supplier-payment-form";
import type { PersonPickerResult } from "@/components/record/people-record-dialog-helpers";
import type { RecordActionKey } from "@/lib/record-actions";

export function renderEmbeddedForm(
  action: RecordActionKey,
  person: PersonPickerResult,
  balanceKurus: number | undefined,
  entityId: string,
  onClose: () => void,
  paymentDateIso?: string,
) {
  const payCurrency = person.payCurrency ?? "TRY";
  const formProps = { embedded: true as const, open: true, onClose };

  switch (action) {
    case "staffAccrual":
      return (
        <StaffAccrualForm
          {...formProps}
          employeeId={person.id}
          payCurrency={payCurrency}
        />
      );
    case "staffAdvance":
      return (
        <StaffCashMovementForm
          {...formProps}
          employeeId={person.id}
          payCurrency={payCurrency}
        />
      );
    case "staffPayment":
      return (
        <StaffSalaryPaymentDialog
          {...formProps}
          entityId={entityId}
          employeeId={person.id}
          employeeName={person.name}
          payCurrency={payCurrency}
          source="staff"
          hidePaymentDate
          paymentDate={paymentDateIso}
        />
      );
    case "customerCreditSale":
      return (
        <GroupSaleForm {...formProps} customerId={person.id} />
      );
    case "customerPayment":
      return (
        <CustomerPaymentForm
          {...formProps}
          customerId={person.id}
          balanceKurus={balanceKurus}
        />
      );
    case "supplierPayment":
      return (
        <SupplierPaymentForm
          {...formProps}
          supplierId={person.id}
          balanceKurus={balanceKurus}
        />
      );
    default:
      return null;
  }
}
