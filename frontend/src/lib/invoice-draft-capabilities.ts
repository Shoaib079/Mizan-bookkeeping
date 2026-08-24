/** Pure capability flags for invoice draft review UI (no React). */

import {
  canDiscardInvoiceDraft,
  canUnconfirmInvoiceDraft,
} from "@/lib/review-status";
import {
  needsClassificationReview,
  needsDeliveryPlatformLink,
} from "@/lib/invoice-classification";
import { isInvoiceDraftReadOnly } from "@/lib/invoice-draft-list";
import type { InvoiceDraft } from "@/lib/invoice-draft-types";
import { formatTrDate } from "@/lib/money";

export type InvoiceDraftCapabilities = {
  isCommission: boolean;
  needsPlatformLink: boolean;
  isCreditNote: boolean;
  classificationReview: boolean;
  expenseAccountReview: boolean;
  canLink: boolean;
  canConfirm: boolean;
  canPost: boolean;
  canOneClickPost: boolean;
  canUnconfirm: boolean;
  canReject: boolean;
  viewOnly: boolean;
  isTerminal: boolean;
  invoiceNumberLabel: string;
  invoiceDateLabel: string;
  amountsMissing: boolean;
};

/** One-click post eligibility — shared with unit tests (no UI duplicate). */
export function canOneClickPostInvoiceDraft(draft: {
  one_click_post_eligible: boolean;
  status: string;
  invoice_kind: string;
  supplier_id: string | null;
  delivery_platform_id: string | null;
}): boolean {
  const canLink = draft.status === "draft" || draft.status === "needs_review";
  const isCommission = draft.invoice_kind === "delivery_commission";
  return (
    draft.one_click_post_eligible &&
    canLink &&
    (isCommission
      ? Boolean(draft.delivery_platform_id)
      : Boolean(draft.supplier_id))
  );
}

export function invoiceDraftCapabilities(
  draft: InvoiceDraft,
  readOnly: boolean,
): InvoiceDraftCapabilities {
  const isCommission = draft.invoice_kind === "delivery_commission";
  const canLink =
    draft.status === "draft" || draft.status === "needs_review";
  return {
    isCommission,
    needsPlatformLink: needsDeliveryPlatformLink(draft),
    isCreditNote: draft.invoice_kind === "supplier_credit",
    classificationReview: needsClassificationReview(
      draft.classification_confidence,
    ),
    expenseAccountReview: needsClassificationReview(
      draft.expense_account_confidence,
    ),
    canLink,
    canConfirm:
      canLink &&
      (isCommission
        ? Boolean(draft.delivery_platform_id)
        : Boolean(draft.supplier_id)),
    canPost: draft.status === "confirmed",
    canOneClickPost: canOneClickPostInvoiceDraft(draft),
    canUnconfirm: canUnconfirmInvoiceDraft(draft.status),
    canReject: canDiscardInvoiceDraft(draft.status),
    viewOnly: isInvoiceDraftReadOnly(draft.status, readOnly),
    isTerminal:
      draft.status === "posted" || draft.status === "rejected",
    invoiceNumberLabel: draft.invoice_number.trim() || "—",
    invoiceDateLabel: draft.extraction_payload?.invoice_date_missing
      ? "—"
      : formatTrDate(draft.invoice_date),
    amountsMissing: Boolean(draft.extraction_payload?.amounts_missing),
  };
}
