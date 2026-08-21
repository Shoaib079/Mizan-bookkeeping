/** Shared supplier activity row shape (API payload). */

import type { SubledgerDisplayKind } from "@/lib/ledger-display";

export type SupplierActivityRow = {
  movement_date: string;
  movement_kind: string;
  movement_label: string;
  document_ref: string;
  detail: string;
  net_kurus: number | null;
  vat_kurus: number | null;
  amount_kurus: number | null;
  bank_name: string | null;
  dekont_ref: string | null;
  balance_kurus: number;
  affects_balance: boolean;
  invoice_draft_id: string | null;
  journal_entry_id: string | null;
  has_document: boolean;
  can_edit: boolean;
  can_void: boolean;
  void_path: string | null;
  expense_account_id: string | null;
  payment_account_id: string | null;
  display_kind?: SubledgerDisplayKind;
  was_corrected?: boolean;
};
