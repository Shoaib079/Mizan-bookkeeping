"""One-click supplier invoice post — confirm + post when all trust gates are HIGH."""

from __future__ import annotations

import uuid

from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind
from app.features.invoices.supplier_expense_learning import SupplierExpenseAccountSuggestion
from app.features.invoices.validation import InvoiceTotalsError, validate_invoice_totals

_BLOCKING_REVIEW_MARKERS = (
    "Extracted supplier VKN",
    "Could not extract supplier VKN",
    "Platform commission invoice detected",
    "Learned delivery commission",
    "Learned suggestion",
    "Getir invoice",
    "Link a supplier",
    "link the delivery platform",
    "confirm or change type",
)


def _has_blocking_review_reason(reason: str | None) -> bool:
    if not reason:
        return False
    lowered = reason.casefold()
    return any(marker.casefold() in lowered for marker in _BLOCKING_REVIEW_MARKERS)


def is_one_click_post_eligible(
    draft: InvoiceDraft,
    *,
    classification_confidence: str,
    expense_suggestion: SupplierExpenseAccountSuggestion | None,
) -> bool:
    """Supplier invoice ready for a single confirm+post action."""
    if InvoiceKind(draft.invoice_kind) != InvoiceKind.SUPPLIER:
        return False

    status = InvoiceDraftStatus(draft.status)
    if status not in {InvoiceDraftStatus.DRAFT, InvoiceDraftStatus.NEEDS_REVIEW}:
        return False

    if draft.supplier_id is None:
        return False

    if classification_confidence != "high":
        return False

    if expense_suggestion is None or expense_suggestion.confidence != "high":
        return False

    if _has_blocking_review_reason(draft.review_reason):
        return False

    try:
        validate_invoice_totals(
            draft.net_kurus,
            draft.gross_kurus,
            draft.vat_breakdown or [],
        )
    except InvoiceTotalsError:
        return False

    return True
