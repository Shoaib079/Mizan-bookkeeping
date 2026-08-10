"use client";

import { useCallback, useState } from "react";

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
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
import { useToast } from "@/lib/toast";
import {
  canUseGenericLedgerCorrect,
  generalLedgerEntryActions,
  journalEntryRowActions,
} from "@/lib/subledger-actions";

export type GlEntryActionsRow = {
  id: string;
  entry_date: string;
  description: string;
  source: string;
  status: string;
};

type LedgerEntryActionsResponse = {
  can_edit: boolean;
  can_void: boolean;
  void_path: string | null;
  edit: { kind: string; context: Record<string, unknown> } | null;
};

type Props = {
  row: GlEntryActionsRow;
  onGenericEdit: () => void;
  onSaved: () => void;
};

export function GlEntryActions({ row, onGenericEdit, onSaved }: Props) {
  const { entityId } = useEntity();
  const { toast } = useToast();
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidPath, setVoidPath] = useState<string | null>(null);
  const [partnerEdit, setPartnerEdit] = useState<{
    partnerId: string;
    entry: CorrectablePartnerLedgerRow;
  } | null>(null);
  const [staffEdit, setStaffEdit] = useState<{
    employeeId: string;
    entry: CorrectableStaffLedgerRow;
  } | null>(null);
  const [customerPaymentEdit, setCustomerPaymentEdit] = useState<{
    customerId: string;
    payment: CorrectableCustomerPaymentRow;
  } | null>(null);
  const [creditSaleEdit, setCreditSaleEdit] = useState<{
    customerId: string;
    sale: CorrectableCreditSaleRow;
  } | null>(null);
  const [writeOffEdit, setWriteOffEdit] = useState<{
    customerId: string;
    balanceKurus: number;
    writeOff: CorrectableWriteOffRow;
  } | null>(null);
  const [fxPurchaseEdit, setFxPurchaseEdit] = useState<{
    fxAccountId: string;
    currency: string;
    purchase: CorrectableFxPurchaseRow;
  } | null>(null);
  const [fxLedgerEdit, setFxLedgerEdit] = useState<{
    currency: string;
    entry: CorrectableFxSpendRow;
  } | null>(null);
  const [expenseEdit, setExpenseEdit] = useState<CorrectableExpenseRow | null>(
    null,
  );
  const [profitAllocationEdit, setProfitAllocationEdit] =
    useState<CorrectableProfitAllocationRow | null>(null);
  const [supplierInvoiceEdit, setSupplierInvoiceEdit] = useState<{
    supplierId: string;
    invoice: CorrectableSupplierInvoiceRow;
  } | null>(null);
  const [supplierPaymentEdit, setSupplierPaymentEdit] = useState<{
    supplierId: string;
    payment: CorrectableSupplierPaymentRow;
  } | null>(null);
  const [commissionEdit, setCommissionEdit] =
    useState<CorrectableDeliveryCommissionRow | null>(null);
  const [groupSaleEditId, setGroupSaleEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = generalLedgerEntryActions(row.source);
  const actions = journalEntryRowActions(row.source);

  const loadActions = useCallback(async (): Promise<LedgerEntryActionsResponse> => {
    if (!entityId) {
      throw new Error("No entity selected");
    }
    if (preview.useGenericEndpoints) {
      return {
        can_edit: canUseGenericLedgerCorrect(row.source),
        can_void: true,
        void_path: `ledger/entries/${row.id}/void`,
        edit: preview.canEdit
          ? { kind: "generic_ledger", context: {} }
          : null,
      };
    }
    return apiFetch<LedgerEntryActionsResponse>(
      `/entities/${entityId}/ledger/entries/${row.id}/actions`,
    );
  }, [entityId, preview.canEdit, preview.useGenericEndpoints, row.id, row.source]);

  async function startVoid() {
    setBusy(true);
    try {
      const actions = await loadActions();
      if (!actions.can_void || !actions.void_path || !entityId) return;
      setVoidPath(`/entities/${entityId}/${actions.void_path}`);
      setVoidOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function startEdit() {
    setBusy(true);
    try {
      const actions = await loadActions();
      if (!actions.can_edit || !actions.edit) return;
      const ctx = actions.edit.context;
      switch (actions.edit.kind) {
        case "generic_ledger":
          onGenericEdit();
          return;
        case "expense":
          setExpenseEdit({
            id: String(ctx.id),
            expense_date: String(ctx.expense_date),
            description: String(ctx.description),
            written_item_description:
              ctx.written_item_description == null
                ? null
                : String(ctx.written_item_description),
            notes:
              ctx.notes == null || ctx.notes === undefined
                ? null
                : String(ctx.notes),
            amount_kurus: Number(ctx.amount_kurus),
            expense_account_id: String(ctx.expense_account_id),
            money_account_id: String(ctx.money_account_id),
            status: String(ctx.status),
            journal_entry_id: String(ctx.journal_entry_id),
          });
          return;
        case "partner_profit_allocation":
          setProfitAllocationEdit({
            journal_entry_id: row.id,
            allocation_date: String(ctx.allocation_date),
            description: String(ctx.description),
            profit_kurus: Number(ctx.profit_kurus),
          });
          return;
        case "partner_ledger":
          setPartnerEdit({
            partnerId: String(ctx.partner_id),
            entry: {
              journal_entry_id: row.id,
              movement_date: String(ctx.movement_date),
              movement_type: String(ctx.movement_type),
              amount_kurus: Number(ctx.amount_kurus),
              description: String(ctx.description),
            },
          });
          return;
        case "staff_ledger":
          setStaffEdit({
            employeeId: String(ctx.employee_id),
            entry: {
              journal_entry_id: row.id,
              movement_date: String(ctx.movement_date),
              movement_type: String(ctx.movement_type),
              amount_minor: Number(ctx.amount_minor),
              description: String(ctx.description),
              extra_days:
                ctx.extra_days == null ? undefined : Number(ctx.extra_days),
            },
          });
          return;
        case "customer_payment":
          setCustomerPaymentEdit({
            customerId: String(ctx.customer_id),
            payment: {
              journal_entry_id: row.id,
              movement_date: String(ctx.movement_date),
              amount_kurus: Number(ctx.amount_kurus),
              description: String(ctx.description),
              payment_native_quantity:
                ctx.payment_native_quantity == null
                  ? null
                  : Number(ctx.payment_native_quantity),
              forex_currency:
                ctx.forex_currency == null
                  ? null
                  : String(ctx.forex_currency),
            },
          });
          return;
        case "fx_purchase":
          // `currency` is one hop off the money account and the row does not
          // carry it, which is the only reason this form was unreachable here.
          setFxPurchaseEdit({
            fxAccountId: String(ctx.fx_money_account_id),
            currency: String(ctx.currency ?? ""),
            purchase: {
              journal_entry_id: row.id,
              movement_date: String(ctx.movement_date),
              native_quantity: Number(ctx.native_quantity),
              try_cost_kurus: Number(ctx.try_cost_kurus),
              description: String(ctx.description),
            },
          });
          return;
        case "fx_ledger":
          setFxLedgerEdit({
            currency: String(ctx.currency ?? ""),
            entry: {
              journal_entry_id: row.id,
              movement_date: String(ctx.movement_date),
              movement_type: String(ctx.movement_type),
              native_quantity: Number(ctx.native_quantity),
              try_cost_kurus: Number(ctx.try_cost_kurus),
              description: String(ctx.description),
              journal_source: String(ctx.journal_source),
              fx_money_account_id: String(ctx.fx_money_account_id),
            } as CorrectableFxSpendRow,
          });
          return;
        case "customer_write_off":
          // `balance_kurus` comes from the edit context because the dialog
          // cannot work it out here: raising a write-off is capped at the
          // customer's outstanding balance plus what this one already took
          // off, and the General ledger does not have that number.
          setWriteOffEdit({
            customerId: String(ctx.customer_id),
            balanceKurus: Number(ctx.balance_kurus),
            writeOff: {
              journal_entry_id: row.id,
              amount_kurus: Number(ctx.amount_kurus),
              description: String(ctx.description),
            },
          });
          return;
        case "customer_credit_sale":
          setCreditSaleEdit({
            customerId: String(ctx.customer_id),
            sale: {
              journal_entry_id: row.id,
              movement_date: String(ctx.movement_date),
              amount_kurus: Number(ctx.amount_kurus),
              description: String(ctx.description),
            },
          });
          return;
        case "supplier_invoice":
          setSupplierInvoiceEdit({
            supplierId: String(ctx.supplier_id),
            invoice: {
              journal_entry_id: row.id,
              movement_date: String(ctx.movement_date),
              amount_kurus: Number(ctx.amount_kurus),
              description: String(ctx.description),
            },
          });
          return;
        case "supplier_payment":
          setSupplierPaymentEdit({
            supplierId: String(ctx.supplier_id),
            payment: {
              journal_entry_id: row.id,
              movement_date: String(ctx.movement_date),
              amount_kurus: Number(ctx.amount_kurus),
              description: String(ctx.description),
            },
          });
          return;
        case "group_sale":
          // Only the id. The form wants the whole sale — lines, pax, rates,
          // currency — so the loader fetches it rather than the ledger
          // reassembling a shape the sale's own page already knows.
          setGroupSaleEditId(String(ctx.group_sale_id));
          return;
        case "delivery_commission":
          setCommissionEdit({
            journal_entry_id: row.id,
            movement_date: String(ctx.movement_date),
            amount_kurus: Number(ctx.gross_kurus),
            description: String(ctx.description),
          });
          return;
        default:
          // Loud, not silent. This arm is how Edit came to render on supplier
          // invoices and do nothing at all when pressed — the backend offered
          // an edit kind the switch had no case for, and `return` swallowed
          // it. A button that does nothing is worse than no button: it reads
          // as the app being broken, with nothing to report.
          toast(
            `Editing is not available here for this entry (${actions.edit.kind}). ` +
              "Open it from its own page.",
            "warning",
          );
          return;
      }
    } finally {
      setBusy(false);
    }
  }

  if (row.status !== "posted") return null;
  if (!actions.canEdit && !actions.canVoid) return null;

  return (
    <>
      <SubledgerRowActions
        row={{ display_kind: "effective", journal_entry_id: row.id }}
        showEdit={actions.canEdit}
        onEdit={() => void startEdit()}
        onVoid={() => void startVoid()}
      />
      {busy && (
        <span className="ml-1 text-xs text-muted-foreground">…</span>
      )}
      <VoidSubledgerDialog
        open={voidOpen}
        title="Void ledger entry"
        description={row.description}
        voidPath={voidPath}
        onClose={() => {
          setVoidOpen(false);
          setVoidPath(null);
        }}
        onSaved={() => {
          setVoidOpen(false);
          setVoidPath(null);
          onSaved();
        }}
      />
      <GroupSaleEditLoader
        open={groupSaleEditId !== null}
        groupSaleId={groupSaleEditId}
        onClose={() => setGroupSaleEditId(null)}
        onSaved={() => {
          setGroupSaleEditId(null);
          onSaved();
        }}
      />
      {partnerEdit && (
        <CorrectPartnerLedgerForm
          open
          partnerId={partnerEdit.partnerId}
          entry={partnerEdit.entry}
          onClose={() => setPartnerEdit(null)}
          onSaved={() => {
            setPartnerEdit(null);
            onSaved();
          }}
        />
      )}
      {staffEdit && (
        <CorrectStaffLedgerForm
          open
          employeeId={staffEdit.employeeId}
          entry={staffEdit.entry}
          onClose={() => setStaffEdit(null)}
          onSaved={() => {
            setStaffEdit(null);
            onSaved();
          }}
        />
      )}
      {customerPaymentEdit && (
        <CorrectCustomerPaymentForm
          open
          customerId={customerPaymentEdit.customerId}
          payment={customerPaymentEdit.payment}
          onClose={() => setCustomerPaymentEdit(null)}
          onSaved={() => {
            setCustomerPaymentEdit(null);
            onSaved();
          }}
        />
      )}
      {fxPurchaseEdit && (
        <CorrectFxPurchaseForm
          open
          fxAccountId={fxPurchaseEdit.fxAccountId}
          currency={fxPurchaseEdit.currency}
          purchase={fxPurchaseEdit.purchase}
          onClose={() => setFxPurchaseEdit(null)}
          onSaved={() => {
            setFxPurchaseEdit(null);
            onSaved();
          }}
        />
      )}
      {fxLedgerEdit && (
        <CorrectFxLedgerForm
          open
          currency={fxLedgerEdit.currency}
          entry={fxLedgerEdit.entry}
          onClose={() => setFxLedgerEdit(null)}
          onSaved={() => {
            setFxLedgerEdit(null);
            onSaved();
          }}
        />
      )}
      {writeOffEdit && (
        <CustomerWriteOffDialog
          open
          customerId={writeOffEdit.customerId}
          balanceKurus={writeOffEdit.balanceKurus}
          correcting={writeOffEdit.writeOff}
          onClose={() => setWriteOffEdit(null)}
          onSaved={() => {
            setWriteOffEdit(null);
            onSaved();
          }}
        />
      )}
      {creditSaleEdit && (
        <CorrectCreditSaleForm
          open
          customerId={creditSaleEdit.customerId}
          sale={creditSaleEdit.sale}
          onClose={() => setCreditSaleEdit(null)}
          onSaved={() => {
            setCreditSaleEdit(null);
            onSaved();
          }}
        />
      )}
      {expenseEdit && (
        <CorrectExpenseForm
          open
          expense={expenseEdit}
          onClose={() => setExpenseEdit(null)}
          onSaved={() => {
            setExpenseEdit(null);
            onSaved();
          }}
        />
      )}
      {profitAllocationEdit && (
        <CorrectPartnerProfitAllocationForm
          open
          entry={profitAllocationEdit}
          onClose={() => setProfitAllocationEdit(null)}
          onSaved={() => {
            setProfitAllocationEdit(null);
            onSaved();
          }}
        />
      )}
      {supplierInvoiceEdit && (
        <CorrectSupplierInvoiceForm
          open
          supplierId={supplierInvoiceEdit.supplierId}
          invoice={supplierInvoiceEdit.invoice}
          onClose={() => setSupplierInvoiceEdit(null)}
          onSaved={() => {
            setSupplierInvoiceEdit(null);
            onSaved();
          }}
        />
      )}
      {commissionEdit && (
        <CorrectDeliveryCommissionForm
          open
          invoice={commissionEdit}
          onClose={() => setCommissionEdit(null)}
          onSaved={() => {
            setCommissionEdit(null);
            onSaved();
          }}
        />
      )}
      {supplierPaymentEdit && (
        <CorrectSupplierPaymentForm
          open
          supplierId={supplierPaymentEdit.supplierId}
          payment={supplierPaymentEdit.payment}
          onClose={() => setSupplierPaymentEdit(null)}
          onSaved={() => {
            setSupplierPaymentEdit(null);
            onSaved();
          }}
        />
      )}
    </>
  );
}
