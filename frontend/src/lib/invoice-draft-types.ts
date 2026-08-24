/** Shared types for invoice draft review (file-size split). */

import type { ChartAccount } from "@/lib/expense-accounts";

export type VatLine = {
  rate_percent: number;
  base_kurus: number;
  vat_kurus: number;
};

export type InvoiceDraft = {
  id: string;
  status: string;
  invoice_kind: string;
  invoice_number: string;
  referenced_invoice_number: string | null;
  referenced_invoice_date: string | null;
  invoice_date: string;
  supplier_name: string | null;
  supplier_vkn: string | null;
  supplier_id: string | null;
  delivery_platform_id: string | null;
  linked_supplier_name: string | null;
  linked_supplier_vkn: string | null;
  linked_platform_name: string | null;
  net_kurus: number;
  gross_kurus: number;
  vat_breakdown: VatLine[];
  review_reason: string | null;
  classification_confidence: "high" | "medium" | "low" | null;
  has_stored_document: boolean;
  source_type: string;
  extraction_payload?: {
    invoice_date_missing?: boolean;
    amounts_missing?: boolean;
    stored_path?: string;
  };
  suggested_expense_account_id: string | null;
  expense_account_confidence: "high" | "medium" | "low" | null;
  one_click_post_eligible: boolean;
  posted_by_rule_auto: boolean;
  journal_entry_id: string | null;
};

export type SupplierOption = { id: string; name: string; vkn: string };
export type InvoiceDraftAccount = ChartAccount;

export type InvoiceDraftReviewProps = {
  draftId: string;
  embedded?: boolean;
  /** Read-only view for posted/rejected invoices — no mutate actions. */
  readOnly?: boolean;
  /** `removed` when the draft leaves the workbench (reject/post); else keep panel open. */
  onUpdated?: (outcome?: "removed" | "updated") => void;
};
