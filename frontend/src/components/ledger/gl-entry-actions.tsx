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
import { VoidSubledgerDialog } from "@/components/forms/void-subledger-dialog";
import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { apiFetch } from "@/lib/api";
import { useEntity } from "@/lib/entity-context";
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
  const [expenseEdit, setExpenseEdit] = useState<CorrectableExpenseRow | null>(
    null,
  );
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
            amount_kurus: Number(ctx.amount_kurus),
            expense_account_id: String(ctx.expense_account_id),
            money_account_id: String(ctx.money_account_id),
            status: String(ctx.status),
            journal_entry_id: String(ctx.journal_entry_id),
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
        default:
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
    </>
  );
}
