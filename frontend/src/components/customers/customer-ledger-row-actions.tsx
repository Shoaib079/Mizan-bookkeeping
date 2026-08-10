"use client";

import { SubledgerRowActions } from "@/components/ledger/subledger-row-actions";
import { type SubledgerDisplayKind } from "@/lib/ledger-display";
import { customerLedgerRowActions } from "@/lib/subledger-actions";

/** Void wording paired with the API path it posts to.
 *
 * A path builder rather than a shared segment: a group sale is not voided
 * through the customer at all. It is its own record, keyed by the sale, and
 * the `customers/{id}/` prefix only held while every row was customer-scoped.
 */
export const VOIDABLE_ROWS = {
  payment: {
    title: "Void customer payment",
    path: (customerId: string, id: string) =>
      `customers/${customerId}/payments/${id}/void`,
  },
  credit_sale: {
    title: "Void credit sale",
    path: (customerId: string, id: string) =>
      `customers/${customerId}/credit-sales/${id}/void`,
  },
  write_off: {
    title: "Void receivable write-off",
    path: (customerId: string, id: string) =>
      `customers/${customerId}/write-offs/${id}/void`,
  },
  group_sale: {
    title: "Void group sale",
    path: (_customerId: string, saleId: string) => `group-sales/${saleId}/void`,
  },
} as const;

export type VoidableRowKind = keyof typeof VOIDABLE_ROWS;

/** The minimum a row must tell us to be acted on. */
export type CustomerLedgerActionRow = {
  movement_date: string;
  movement_type: string;
  description: string;
  amount_kurus: number;
  forex_currency: string | null;
  payment_native_quantity: number | null;
  reference_type: string | null;
  reference_id: string | null;
  journal_entry_id: string | null;
  payment_account_id: string | null;
  display_kind: SubledgerDisplayKind;
};

export type CustomerLedgerVoidTarget = {
  journal_entry_id: string;
  description: string;
  kind: VoidableRowKind;
};

/** What Edit should open, decided once, in the row's own terms. */
export type CustomerLedgerEditTarget =
  | { kind: "group_sale"; groupSaleId: string }
  | {
      kind: "write_off";
      journal_entry_id: string;
      amount_kurus: number;
      description: string;
    }
  | {
      kind: "payment";
      journal_entry_id: string;
      movement_date: string;
      amount_kurus: number;
      description: string;
      payment_account_id: string | null;
      payment_native_quantity: number | null;
      forex_currency: string | null;
    }
  | {
      kind: "credit_sale";
      journal_entry_id: string;
      movement_date: string;
      amount_kurus: number;
      description: string;
    };

/** A group sale shows in the customer's ledger as a credit sale that names one.
 *
 * Both Edit and Void act on the sale (`reference_id`), not on the journal
 * entry — it is its own record with its own routes.
 */
function isGroupSale(row: CustomerLedgerActionRow): boolean {
  return (
    row.movement_type === "credit_sale" &&
    row.reference_type === "group_sale" &&
    Boolean(row.reference_id)
  );
}

export function customerLedgerEditTarget(
  row: CustomerLedgerActionRow,
): CustomerLedgerEditTarget {
  if (isGroupSale(row)) {
    return { kind: "group_sale", groupSaleId: String(row.reference_id) };
  }
  const journal_entry_id = row.journal_entry_id!;
  if (row.movement_type === "discount") {
    return {
      kind: "write_off",
      journal_entry_id,
      amount_kurus: row.amount_kurus,
      description: row.description,
    };
  }
  if (row.movement_type === "payment_received") {
    return {
      kind: "payment",
      journal_entry_id,
      movement_date: row.movement_date,
      amount_kurus: row.amount_kurus,
      description: row.description,
      payment_account_id: row.payment_account_id,
      payment_native_quantity: row.payment_native_quantity,
      forex_currency: row.forex_currency,
    };
  }
  return {
    kind: "credit_sale",
    journal_entry_id,
    movement_date: row.movement_date,
    amount_kurus: row.amount_kurus,
    description: row.description,
  };
}

export function customerLedgerVoidTarget(
  row: CustomerLedgerActionRow,
): CustomerLedgerVoidTarget {
  if (isGroupSale(row)) {
    return {
      journal_entry_id: String(row.reference_id),
      description: row.description,
      kind: "group_sale",
    };
  }
  return {
    journal_entry_id: row.journal_entry_id!,
    description: row.description,
    kind:
      row.movement_type === "payment_received"
        ? "payment"
        : row.movement_type === "discount"
          ? "write_off"
          : "credit_sale",
  };
}

/** Edit and Void for one row of the customer ledger.
 *
 * `customerLedgerRowActions` is asked here and nowhere else on the page, so
 * "may this row be edited" has one answer. A group sale used to bypass it
 * entirely with its own combined "Edit / Void" button that navigated away —
 * which also meant the button appeared on superseded rows, since nothing
 * checked `display_kind`.
 */
export function CustomerLedgerRowActions({
  row,
  onEdit,
  onVoid,
}: {
  row: CustomerLedgerActionRow;
  onEdit: (target: CustomerLedgerEditTarget) => void;
  onVoid: (target: CustomerLedgerVoidTarget) => void;
}) {
  const actions = customerLedgerRowActions({
    movementType: row.movement_type,
    referenceType: row.reference_type,
  });
  if (!actions.canEdit && !actions.canVoid) return null;
  return (
    <SubledgerRowActions
      row={row}
      showEdit={actions.canEdit}
      onEdit={() => onEdit(customerLedgerEditTarget(row))}
      onVoid={() => onVoid(customerLedgerVoidTarget(row))}
    />
  );
}
