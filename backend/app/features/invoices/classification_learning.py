"""Invoice classification learning — suggestions, confidence, corrections (IC-D)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.ocr_ai.efatura import EInvoiceExtraction
from app.core.delivery.commission_detect import classify_efatura_intake
from app.core.expenses.normalize import normalize_expense_item_text
from app.core.learning import LearningDomain, confidence_label, record_learning_correction
from app.db.base import utcnow
from app.features.invoices.classification_rule_models import InvoiceClassificationRule
from app.features.invoices.models import InvoiceKind


@dataclass(frozen=True)
class InvoiceClassificationSuggestion:
    invoice_kind: str
    delivery_platform_id: uuid.UUID | None
    confidence: str
    reason: str
    learned: bool


def _pdf_text(extraction: EInvoiceExtraction, pdf_text: str | None) -> str:
    if pdf_text:
        return pdf_text
    if extraction.raw:
        sample = extraction.raw.get("text_sample")
        if isinstance(sample, str):
            return sample
    return ""


def derive_invoice_match_token(
    extraction: EInvoiceExtraction,
    *,
    pdf_text: str | None = None,
    match_token: str | None = None,
) -> str | None:
    """Pick a stable token for learned invoice rules."""
    if match_token and match_token.strip():
        return normalize_expense_item_text(match_token)

    text = _pdf_text(extraction, pdf_text).casefold()
    if "depo:" in text or "depo :" in text:
        return "depo"
    if "hizmet bedeli" in text or "komisyon" in text:
        return normalize_expense_item_text("komisyon hizmet bedeli")

    vkn = (extraction.supplier_vkn or "").strip()
    if vkn:
        return vkn

    return normalize_expense_item_text(extraction.supplier_name or "")


def _matching_rules(
    session: Session,
    *,
    seller_vkn: str | None,
    text: str,
) -> list[InvoiceClassificationRule]:
    normalized_text = normalize_expense_item_text(text)
    if not normalized_text:
        return []

    vkn = (seller_vkn or "").strip()
    rules = list(session.scalars(select(InvoiceClassificationRule)))
    matches: list[InvoiceClassificationRule] = []
    for rule in rules:
        if not rule.match_token:
            continue
        token_in_text = rule.match_token in normalized_text
        token_is_vkn = bool(vkn) and rule.match_token == vkn
        if not token_in_text and not token_is_vkn:
            continue
        if rule.seller_vkn and rule.seller_vkn != vkn:
            continue
        matches.append(rule)
    return matches


def suggest_invoice_classification(
    session: Session,
    extraction: EInvoiceExtraction,
    *,
    pdf_text: str | None = None,
) -> InvoiceClassificationSuggestion | None:
    """Best learned rule for this document, or None to fall back to heuristics."""
    text = _pdf_text(extraction, pdf_text)
    matches = _matching_rules(
        session,
        seller_vkn=extraction.supplier_vkn,
        text=text,
    )
    if not matches:
        return None

    signatures = {
        (rule.invoice_kind, rule.delivery_platform_id) for rule in matches
    }
    if len(signatures) > 1:
        return None

    best = max(matches, key=lambda rule: (rule.confirmation_count, len(rule.match_token)))
    label = confidence_label(best.confirmation_count, best.confirmations_since_correction)
    return InvoiceClassificationSuggestion(
        invoice_kind=best.invoice_kind,
        delivery_platform_id=best.delivery_platform_id,
        confidence=label,
        reason=(
            f"Matched learned token {best.match_token!r} "
            f"({best.confirmation_count} prior confirmation"
            f"{'s' if best.confirmation_count != 1 else ''})"
        ),
        learned=True,
    )


def classify_invoice_intake(
    session: Session,
    extraction: EInvoiceExtraction,
    *,
    pdf_text: str | None = None,
) -> tuple[str, uuid.UUID | None, str, str | None]:
    """Learned rules first, then deterministic heuristics."""
    learned = suggest_invoice_classification(session, extraction, pdf_text=pdf_text)
    if learned is not None:
        review_reason: str | None = None
        if learned.invoice_kind == InvoiceKind.DELIVERY_COMMISSION.value:
            if learned.delivery_platform_id is None:
                review_reason = (
                    "Learned delivery commission — link the delivery platform before confirm"
                )
        if learned.confidence != "high":
            review_reason = (
                review_reason
                or f"Learned suggestion ({learned.confidence}) — confirm or change type"
            )
        return (
            learned.invoice_kind,
            learned.delivery_platform_id,
            learned.confidence,
            review_reason,
        )

    heuristic = classify_efatura_intake(extraction, pdf_text=pdf_text)
    return (
        heuristic.invoice_kind,
        None,
        heuristic.confidence,
        heuristic.review_reason,
    )


def learn_invoice_classification_rule(
    session: Session,
    *,
    extraction: EInvoiceExtraction,
    invoice_kind: str,
    delivery_platform_id: uuid.UUID | None = None,
    pdf_text: str | None = None,
    match_token: str | None = None,
) -> None:
    token = derive_invoice_match_token(
        extraction,
        pdf_text=pdf_text,
        match_token=match_token,
    )
    if not token:
        return

    seller_vkn = (extraction.supplier_vkn or "").strip() or None
    platform_id = (
        delivery_platform_id
        if invoice_kind == InvoiceKind.DELIVERY_COMMISSION.value
        else None
    )

    now = utcnow()
    existing = session.scalar(
        select(InvoiceClassificationRule).where(
            InvoiceClassificationRule.match_token == token
        )
    )
    if existing is not None:
        mapping_changed = (
            existing.invoice_kind != invoice_kind
            or existing.delivery_platform_id != platform_id
            or existing.seller_vkn != seller_vkn
        )
        existing.invoice_kind = invoice_kind
        existing.delivery_platform_id = platform_id
        existing.seller_vkn = seller_vkn
        if mapping_changed:
            existing.confirmation_count = 1
            existing.confirmations_since_correction = 1
        else:
            existing.confirmation_count += 1
            existing.confirmations_since_correction += 1
        existing.last_used_at = now
        existing.updated_at = now
        session.flush()
        return

    session.add(
        InvoiceClassificationRule(
            match_token=token,
            seller_vkn=seller_vkn,
            invoice_kind=invoice_kind,
            delivery_platform_id=platform_id,
            confirmation_count=1,
            confirmations_since_correction=1,
            correction_count=0,
            last_used_at=now,
        )
    )
    session.flush()


def record_invoice_rule_correction(
    session: Session,
    *,
    extraction: EInvoiceExtraction,
    before_kind: str,
    corrected_kind: str,
    before_platform_id: uuid.UUID | None,
    corrected_platform_id: uuid.UUID | None,
    pdf_text: str | None = None,
    match_token: str | None = None,
    source_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
) -> None:
    """Downgrade offending rules, log correction diff, relearn corrected mapping."""
    token = derive_invoice_match_token(
        extraction,
        pdf_text=pdf_text,
        match_token=match_token,
    )
    text = _pdf_text(extraction, pdf_text)
    matches = _matching_rules(
        session,
        seller_vkn=extraction.supplier_vkn,
        text=text,
    )
    if token is not None:
        matches = [rule for rule in matches if rule.match_token == token]

    now = utcnow()
    for rule in matches:
        rule.correction_count += 1
        rule.confirmations_since_correction = 0
        rule.updated_at = now

    record_learning_correction(
        session,
        domain=LearningDomain.INVOICE,
        field_name="invoice_kind",
        before_value=before_kind,
        after_value=corrected_kind,
        match_token=token,
        source_id=source_id,
        actor_id=actor_id,
    )
    if before_platform_id != corrected_platform_id:
        record_learning_correction(
            session,
            domain=LearningDomain.INVOICE,
            field_name="delivery_platform_id",
            before_value=str(before_platform_id) if before_platform_id else None,
            after_value=str(corrected_platform_id) if corrected_platform_id else None,
            match_token=token,
            source_id=source_id,
            actor_id=actor_id,
        )

    learn_invoice_classification_rule(
        session,
        extraction=extraction,
        invoice_kind=corrected_kind,
        delivery_platform_id=corrected_platform_id,
        pdf_text=pdf_text,
        match_token=token,
    )
    session.flush()
