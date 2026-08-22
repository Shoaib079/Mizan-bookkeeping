"use client";

/** Edit/Void for one supplier activity payment or invoice row — backend verdict only. */

import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { type CorrectableSupplierPaymentRow } from "@/components/forms/correct-supplier-payment-form";
import { type SupplierActivityRow } from "@/components/supplier-activity-types";
import { formatTrDate, formatTry } from "@/lib/money";
import { formatVoidConfirmDetail } from "@/lib/void-confirm-summary";

type VoidTarget = {
  description: string;
  kind: "payment" | "invoice";
  void_path: string;
};

export function SupplierActivityRowActions({
  row,
  onCorrectPayment,
  onEditInvoice,
  onVoid,
}: {
  row: SupplierActivityRow;
  onCorrectPayment?: (row: CorrectableSupplierPaymentRow) => void;
  onEditInvoice?: (row: {
    journal_entry_id: string;
    movement_date: string;
    amount_kurus: number;
    description: string;
    expense_account_id?: string | null;
  }) => void;
  onVoid: (target: VoidTarget) => void;
}) {
  const offer =
    row.can_edit || (row.can_void && Boolean(row.void_path));
  if (!offer) return null;

  if (row.movement_kind === "payment") {
    const voidDetail = formatVoidConfirmDetail({
      date: formatTrDate(row.movement_date),
      type: "Payment",
      amount:
        row.amount_kurus != null ? formatTry(row.amount_kurus) : undefined,
      description: row.detail,
    });
    return (
      <SubledgerRowActions
        row={row}
        showEdit={Boolean(row.can_edit && onCorrectPayment)}
        voidConfirmDetail={voidDetail}
        onEdit={() =>
          onCorrectPayment?.({
            journal_entry_id: row.journal_entry_id!,
            movement_date: row.movement_date,
            amount_kurus: row.amount_kurus ?? 0,
            description: row.detail,
            payment_account_id: row.payment_account_id,
          })
        }
        onVoid={() => {
          if (!row.void_path) return;
          onVoid({
            description: row.detail,
            kind: "payment",
            void_path: row.void_path,
          });
        }}
      />
    );
  }

  if (row.movement_kind === "invoice") {
    const voidDetail = formatVoidConfirmDetail({
      date: formatTrDate(row.movement_date),
      type: "Invoice",
      amount:
        row.amount_kurus != null ? formatTry(row.amount_kurus) : undefined,
      description: row.detail,
    });
    return (
      <SubledgerRowActions
        row={row}
        showEdit={Boolean(row.can_edit && onEditInvoice)}
        voidConfirmDetail={voidDetail}
        onEdit={() =>
          onEditInvoice?.({
            journal_entry_id: row.journal_entry_id!,
            movement_date: row.movement_date,
            amount_kurus: row.amount_kurus ?? 0,
            description: row.detail,
            expense_account_id: row.expense_account_id,
          })
        }
        onVoid={() => {
          if (!row.void_path) return;
          onVoid({
            description: row.detail,
            kind: "invoice",
            void_path: row.void_path,
          });
        }}
      />
    );
  }

  return null;
}
