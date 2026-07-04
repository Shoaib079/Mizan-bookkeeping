"""One-click invoice post — confirm + post when all trust gates pass."""

from __future__ import annotations

from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind
from app.features.invoices.supplier_expense_learning import SupplierExpenseAccountSuggestion
from app.features.invoices.validation import InvoiceTotalsError, validate_invoice_totals

_BLOCKING_REVIEW_MARKERS = (
    "Extracted supplier VKN",
    "Could not extract supplier VKN",
    "Link a supplier",
    "link the delivery platform",
    "confirm or change type",
    "vision_low_confidence",
    "vision_totals_mismatch",
    "vision_invalid_vkn",
)

_COMMISSION_BLOCKING_MARKERS = (
    *_BLOCKING_REVIEW_MARKERS,
    "Platform commission invoice detected",
    "Learned delivery commission",
    "Learned suggestion",
    "Getir invoice",
)


def _is_vision_extraction(draft: InvoiceDraft) -> bool:
    payload = draft.extraction_payload or {}
    raw = payload.get("raw")
    return isinstance(raw, dict) and raw.get("source") == "vision"


def _has_blocking_review_reason(
    reason: str | None,
    markers: tuple[str, ...] = _BLOCKING_REVIEW_MARKERS,
) -> bool:
    if not reason:
        return False
    lowered = reason.casefold()
    return any(marker.casefold() in lowered for marker in markers)


def _common_gates(draft: InvoiceDraft, classification_confidence: str) -> bool:
    """Shared gates for both supplier and commission one-click post."""
    if _is_vision_extraction(draft):
        return False

    status = InvoiceDraftStatus(draft.status)
    if status not in {InvoiceDraftStatus.DRAFT, InvoiceDraftStatus.NEEDS_REVIEW}:
        return False

    if classification_confidence != "high":
        return False

    try:
        validate_invoice_totals(
            draft.net_kurus,
            draft.gross_kurus,
            draft.vat_breakdown or [],
            other_taxes_kurus=draft.other_taxes_kurus,
        )
    except InvoiceTotalsError:
        return False

    return True


def is_one_click_post_eligible(
    draft: InvoiceDraft,
    *,
    classification_confidence: str,
    expense_suggestion: SupplierExpenseAccountSuggestion | None,
    classification_learned: bool = False,
) -> bool:
    """Supplier or commission invoice ready for a single confirm+post action."""
    kind = InvoiceKind(draft.invoice_kind)

    if kind == InvoiceKind.DELIVERY_COMMISSION:
        return is_commission_one_click_eligible(
            draft,
            classification_confidence=classification_confidence,
            expense_suggestion=expense_suggestion,
            classification_learned=classification_learned,
        )

    if kind != InvoiceKind.SUPPLIER:
        return False

    if not _common_gates(draft, classification_confidence):
        return False

    if draft.supplier_id is None:
        return False

    if expense_suggestion is None or expense_suggestion.confidence != "high":
        return False

    if _has_blocking_review_reason(draft.review_reason):
        return False

    return True


def is_commission_one_click_eligible(
    draft: InvoiceDraft,
    *,
    classification_confidence: str,
    expense_suggestion: SupplierExpenseAccountSuggestion | None,
    classification_learned: bool = False,
) -> bool:
    """Delivery commission invoice one-click post gates."""
    if not _common_gates(draft, classification_confidence):
        return False

    if draft.delivery_platform_id is None:
        return False

    if not classification_learned:
        return False

    if expense_suggestion is None or expense_suggestion.confidence != "high":
        return False

    if _has_blocking_review_reason(draft.review_reason, _COMMISSION_BLOCKING_MARKERS):
        return False

    return True
