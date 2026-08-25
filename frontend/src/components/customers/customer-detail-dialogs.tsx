"use client";

/** Edit / sale / payment / write-off / correct / void dialogs for customer detail. */

import {
  VOIDABLE_ROWS,
  type CustomerLedgerVoidTarget,
} from "@/components/customers/customer-ledger-row-actions";
import {
  CorrectCreditSaleForm,
  type CorrectableCreditSaleRow,
} from "@/components/forms/correct-credit-sale-form";
import {
  CorrectCustomerPaymentForm,
  type CorrectableCustomerPaymentRow,
} from "@/components/forms/correct-customer-payment-form";
import { CustomerForm, type CustomerRow } from "@/components/forms/customer-form";
import { CustomerPaymentForm } from "@/components/forms/customer-payment-form";
import {
  CustomerWriteOffDialog,
  type CorrectableWriteOffRow,
} from "@/components/forms/customer-write-off-dialog";
import { GroupSaleEditLoader } from "@/components/forms/group-sale-edit-loader";
import { GroupSaleForm } from "@/components/forms/group-sale-form";
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { entityPath } from "@/lib/api";
import type { ForexOutstanding } from "@/lib/use-balance-map";

export type CustomerDetailDialogsProps = {
  entityId: string;
  customerId: string;
  customer: CustomerRow;
  balanceKurus: number | undefined;
  outstandingByCurrency: ForexOutstanding[] | undefined;
  editOpen: boolean;
  onEditClose: () => void;
  saleOpen: boolean;
  onSaleClose: () => void;
  paymentOpen: boolean;
  onPaymentClose: () => void;
  writeOffOpen: boolean;
  correctWriteOff: CorrectableWriteOffRow | null;
  onWriteOffClose: () => void;
  correctPayment: CorrectableCustomerPaymentRow | null;
  onCorrectPaymentClose: () => void;
  correctCreditSale: CorrectableCreditSaleRow | null;
  onCorrectCreditSaleClose: () => void;
  groupSaleEditId: string | null;
  onGroupSaleEditClose: () => void;
  voidTarget: CustomerLedgerVoidTarget | null;
  onVoidClose: () => void;
  onSaved: () => void;
};

export function CustomerDetailDialogs({
  entityId,
  customerId,
  customer,
  balanceKurus,
  outstandingByCurrency,
  editOpen,
  onEditClose,
  saleOpen,
  onSaleClose,
  paymentOpen,
  onPaymentClose,
  writeOffOpen,
  correctWriteOff,
  onWriteOffClose,
  correctPayment,
  onCorrectPaymentClose,
  correctCreditSale,
  onCorrectCreditSaleClose,
  groupSaleEditId,
  onGroupSaleEditClose,
  voidTarget,
  onVoidClose,
  onSaved,
}: CustomerDetailDialogsProps) {
  return (
    <>
      <CustomerForm
        open={editOpen}
        customer={customer}
        onClose={onEditClose}
        onSaved={onSaved}
      />
      <GroupSaleForm
        open={saleOpen}
        customerId={customerId}
        onClose={onSaleClose}
        onSaved={onSaved}
      />
      {balanceKurus != null && (
        // One dialog for both jobs: posting a write-off and amending one.
        // `correcting` decides which endpoint it calls and how it caps the
        // amount, so the two cannot drift apart in wording or validation.
        <CustomerWriteOffDialog
          open={writeOffOpen || correctWriteOff !== null}
          customerId={customerId}
          balanceKurus={balanceKurus}
          correcting={correctWriteOff}
          onClose={onWriteOffClose}
          onSaved={onSaved}
        />
      )}
      <CustomerPaymentForm
        open={paymentOpen}
        customerId={customerId}
        balanceKurus={balanceKurus}
        outstandingByCurrency={outstandingByCurrency}
        onClose={onPaymentClose}
        onSaved={onSaved}
      />
      <CorrectCustomerPaymentForm
        open={correctPayment !== null}
        customerId={customerId}
        payment={correctPayment}
        onClose={onCorrectPaymentClose}
        onSaved={onSaved}
      />
      <CorrectCreditSaleForm
        open={correctCreditSale !== null}
        customerId={customerId}
        sale={correctCreditSale}
        onClose={onCorrectCreditSaleClose}
        onSaved={onSaved}
      />
      <GroupSaleEditLoader
        open={groupSaleEditId !== null}
        groupSaleId={groupSaleEditId}
        onClose={onGroupSaleEditClose}
        onSaved={() => {
          onGroupSaleEditClose();
          onSaved();
        }}
      />
      <VoidSubledgerDialog
        open={voidTarget !== null}
        title={voidTarget ? VOIDABLE_ROWS[voidTarget.kind].title : ""}
        description={voidTarget?.description}
        voidPath={
          voidTarget
            ? entityPath(
                entityId,
                VOIDABLE_ROWS[voidTarget.kind].path(
                  customerId,
                  voidTarget.journal_entry_id,
                ),
              )
            : null
        }
        onClose={onVoidClose}
        onSaved={onSaved}
      />
    </>
  );
}
