"use client";

import {
  CorrectExpenseForm,
  type CorrectableExpenseRow,
} from "@/components/forms/correct-expense-form";
import {
  CorrectPartnerLedgerForm,
  type CorrectablePartnerLedgerRow,
} from "@/components/forms/correct-partner-ledger-form";
import {
  CorrectPartnerProfitAllocationForm,
  type CorrectableProfitAllocationRow,
} from "@/components/forms/correct-partner-profit-allocation-form";
import {
  CorrectPartnerFundedSalaryForm,
  type CorrectablePartnerFundedSalaryRow,
} from "@/components/forms/correct-partner-funded-salary-form";
import {
  CorrectStaffLedgerForm,
  type CorrectableStaffLedgerRow,
} from "@/components/forms/correct-staff-ledger-form";
import {
  CorrectCustomerPaymentForm,
  type CorrectableCustomerPaymentRow,
} from "@/components/forms/correct-customer-payment-form";
import {
  CorrectCreditSaleForm,
  type CorrectableCreditSaleRow,
} from "@/components/forms/correct-credit-sale-form";
import {
  CustomerWriteOffDialog,
  type CorrectableWriteOffRow,
} from "@/components/forms/customer-write-off-dialog";
import {
  CorrectFxPurchaseForm,
  type CorrectableFxPurchaseRow,
} from "@/components/forms/correct-fx-purchase-form";
import {
  CorrectFxLedgerForm,
  type CorrectableFxSpendRow,
} from "@/components/forms/correct-fx-ledger-form";
import {
  CorrectDeliveryCommissionForm,
  type CorrectableDeliveryCommissionRow,
} from "@/components/forms/correct-delivery-commission-form";
import {
  CorrectSupplierInvoiceForm,
  type CorrectableSupplierInvoiceRow,
} from "@/components/forms/correct-supplier-invoice-form";
import {
  CorrectSupplierPaymentForm,
  type CorrectableSupplierPaymentRow,
} from "@/components/forms/correct-supplier-payment-form";
import { GroupSaleEditLoader } from "@/components/forms/group-sale-edit-loader";

/** The one thing being edited, whatever kind it is.
 *
 * This replaces twelve `useState` pairs that were mutually exclusive but not
 * declared so. Nothing stopped two being set at once — the render tree tested
 * each independently, so two dialogs could mount together, and closing one
 * left the other behind. It never happened because `startEdit` sets exactly
 * one and returns, but that was a property of how the code was written rather
 * than one the types held.
 *
 * `kind` is the same string the backend sends in `edit.kind`, so the switch
 * below reads against `entry_capabilities.py` directly, and
 * `gl-edit-kinds.test.ts` can keep comparing the two lists by name.
 */
export type GlEditTarget =
  | { kind: "expense"; expense: CorrectableExpenseRow }
  | { kind: "partner_profit_allocation"; entry: CorrectableProfitAllocationRow }
  | {
      kind: "partner_funded_salary";
      entry: CorrectablePartnerFundedSalaryRow;
    }
  | {
      kind: "partner_ledger";
      partnerId: string;
      entry: CorrectablePartnerLedgerRow;
    }
  | { kind: "staff_ledger"; employeeId: string; entry: CorrectableStaffLedgerRow }
  | {
      kind: "customer_payment";
      customerId: string;
      payment: CorrectableCustomerPaymentRow;
    }
  | {
      kind: "customer_credit_sale";
      customerId: string;
      sale: CorrectableCreditSaleRow;
    }
  | {
      kind: "customer_write_off";
      customerId: string;
      balanceKurus: number;
      writeOff: CorrectableWriteOffRow;
    }
  | {
      kind: "fx_purchase";
      fxAccountId: string;
      currency: string;
      purchase: CorrectableFxPurchaseRow;
    }
  | { kind: "fx_ledger"; currency: string; entry: CorrectableFxSpendRow }
  | {
      kind: "supplier_invoice";
      supplierId: string;
      invoice: CorrectableSupplierInvoiceRow;
    }
  | {
      kind: "supplier_payment";
      supplierId: string;
      payment: CorrectableSupplierPaymentRow;
    }
  | { kind: "delivery_commission"; invoice: CorrectableDeliveryCommissionRow }
  | { kind: "group_sale"; groupSaleId: string };

/** Renders whichever correction form the target names, and only that one.
 *
 * Lifted out of `gl-entry-actions.tsx`, which had grown to 545 lines and was
 * two-thirds this. The button, the two API calls and the routing decision are
 * the interesting part of that file; twelve near-identical dialog blocks were
 * burying it.
 *
 * The `switch` returns rather than falls through, so exactly one dialog exists
 * at a time — which the twelve independent `&&` blocks only achieved by
 * convention. `gl-entry-actions.render.test.tsx` asserts that directly: it
 * checks the expected dialog is present *and* that none of the others are.
 */
export function GlEditDialogs({
  target,
  onClose,
  onSaved,
}: {
  target: GlEditTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!target) return null;

  switch (target.kind) {
    case "expense":
      return (
        <CorrectExpenseForm
          open
          expense={target.expense}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "partner_funded_salary":
      return (
        <CorrectPartnerFundedSalaryForm
          open
          entry={target.entry}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "partner_profit_allocation":
      return (
        <CorrectPartnerProfitAllocationForm
          open
          entry={target.entry}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "partner_ledger":
      return (
        <CorrectPartnerLedgerForm
          open
          partnerId={target.partnerId}
          entry={target.entry}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "staff_ledger":
      return (
        <CorrectStaffLedgerForm
          open
          employeeId={target.employeeId}
          entry={target.entry}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "customer_payment":
      return (
        <CorrectCustomerPaymentForm
          open
          customerId={target.customerId}
          payment={target.payment}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "customer_credit_sale":
      return (
        <CorrectCreditSaleForm
          open
          customerId={target.customerId}
          sale={target.sale}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "customer_write_off":
      return (
        <CustomerWriteOffDialog
          open
          customerId={target.customerId}
          balanceKurus={target.balanceKurus}
          correcting={target.writeOff}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "fx_purchase":
      return (
        <CorrectFxPurchaseForm
          open
          fxAccountId={target.fxAccountId}
          currency={target.currency}
          purchase={target.purchase}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "fx_ledger":
      return (
        <CorrectFxLedgerForm
          open
          currency={target.currency}
          entry={target.entry}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "supplier_invoice":
      return (
        <CorrectSupplierInvoiceForm
          open
          supplierId={target.supplierId}
          invoice={target.invoice}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "supplier_payment":
      return (
        <CorrectSupplierPaymentForm
          open
          supplierId={target.supplierId}
          payment={target.payment}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "delivery_commission":
      return (
        <CorrectDeliveryCommissionForm
          open
          invoice={target.invoice}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
    case "group_sale":
      return (
        <GroupSaleEditLoader
          open
          groupSaleId={target.groupSaleId}
          onClose={onClose}
          onSaved={onSaved}
        />
      );
  }
}
