"""One-click invoice post — confirm + post when all trust gates pass."""

from __future__ import annotations

from datetime import date

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


def is_future_dated(invoice_date: date, *, today: date | None = None) -> bool:
    """An invoice dated after today is a misread, not an invoice.

    Suppliers do not send invoices before they are issued. When this appears
    it means the reader picked up the wrong label — a payment due date, a next
    billing date, something further down the page — and the date it chose is
    not the one on the document.

    Why it earns a gate of its own: a wrong date is the one extraction error
    that hides its own evidence. Amounts wrong by a digit show up in the
    balance; a wrong *date* posts a correct amount into a period nobody is
    looking at, and every screen that helps you find it is filtered by date.
    A real one did exactly that — right supplier, right money, dated six weeks
    out, invisible everywhere except payables.
    """
    return invoice_date > (today or date.today())


def vat_was_assumed(draft: InvoiceDraft) -> bool:
    """Was the VAT on this invoice read off the document, or worked out?

    When the reader finds no VAT breakdown it invents one: a single 20% line
    for whatever is left between net and gross. Usually right. On a telecom
    invoice it is not — part of that gap is ÖİV, which is not reclaimable, and
    the assumption claims it as input KDV anyway.

    An owner looking at the preview is told this and can decide. Auto-post has
    no one looking, so it must not take the guess.
    """
    payload = draft.extraction_payload or {}
    raw = payload.get("raw")
    if not isinstance(raw, dict):
        return False
    return bool(raw.get("assumed_vat") or raw.get("net_adjusted"))


def _common_gates(draft: InvoiceDraft, classification_confidence: str) -> bool:
    """Shared gates for both supplier and commission one-click post."""
    if _is_vision_extraction(draft):
        return False

    # Stated directly, though today it is also caught by the confidence gate
    # below — an assumed VAT sets `classification_confidence` to "low" at
    # intake. That is an accident of one code path, not a rule: nothing says
    # confidence must stay low for a guessed tax, and the marker is cleared
    # the moment anyone confirms. An unattended post of a number that goes on
    # a KDV return should not rest on a side effect two files away.
    if vat_was_assumed(draft):
        return False

    # Never post a future-dated invoice on its own. It can still be posted by
    # hand once someone has looked at the document and fixed the date.
    if is_future_dated(draft.invoice_date):
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
