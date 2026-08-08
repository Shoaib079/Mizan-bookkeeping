"""Auto-post trusted supplier e-Faturas on upload when entity setting is on."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.adapters.ocr_ai.efatura import EInvoiceExtraction
from app.core.delivery.commission_detect import classify_efatura_intake
from app.core.invoices.posting import DraftPostError, InvoicePostResult, post_supplier_invoice_draft_to_ledger
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import PostingError
from app.db.base import utcnow
from app.db.session import entity_context
from app.features.invoices.classification_learning import learn_invoice_classification_rule
from app.features.invoices.payload_helpers import pdf_text_from_payload as _pdf_text_from_payload
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind
from app.features.invoices.one_click_post import is_one_click_post_eligible
from app.features.invoices.settings import is_invoice_supplier_auto_post_enabled
from app.features.invoices.supplier_expense_learning import suggest_supplier_expense_account

RULE_AUTO_ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _draft_classification_confidence(draft: InvoiceDraft) -> str:
    payload = draft.extraction_payload or {}
    raw = payload.get("raw")
    if isinstance(raw, dict) and raw.get("source") == "vision":
        stored = payload.get("classification_confidence")
        if stored in ("high", "medium", "low"):
            return stored
        return "medium"
    stored = payload.get("classification_confidence")
    if stored in ("high", "medium", "low"):
        return stored

    text_sample = _pdf_text_from_payload(payload)
    if text_sample:
        extraction = EInvoiceExtraction(
            supplier_name=draft.supplier_name,
            supplier_vkn=draft.supplier_vkn,
            invoice_number=draft.invoice_number,
            invoice_date=draft.invoice_date,
            net_kurus=draft.net_kurus,
            gross_kurus=draft.gross_kurus,
            vat_breakdown=draft.vat_breakdown or [],
            currency=draft.currency,
        )
        return classify_efatura_intake(extraction, pdf_text=text_sample).confidence

    return "high"


def _learn_from_draft_classification(session: Session, draft: InvoiceDraft) -> None:
    payload = draft.extraction_payload or {}
    text = _pdf_text_from_payload(payload)
    learn_invoice_classification_rule(
        session,
        extraction=EInvoiceExtraction(
            supplier_name=draft.supplier_name,
            supplier_vkn=draft.supplier_vkn,
            invoice_number=draft.invoice_number,
            invoice_date=draft.invoice_date,
            net_kurus=draft.net_kurus,
            gross_kurus=draft.gross_kurus,
            vat_breakdown=draft.vat_breakdown or [],
            currency=draft.currency,
        ),
        invoice_kind=draft.invoice_kind,
        delivery_platform_id=draft.delivery_platform_id,
        pdf_text=text,
    )


def confirm_and_post_trusted_supplier_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft: InvoiceDraft,
    *,
    expense_account_id: uuid.UUID,
    actor_id: uuid.UUID,
    auto_posted: bool = False,
) -> InvoicePostResult:
    """Confirm + post atomically; caller holds entity_context.

    Posted as `INVOICE`, the same as one confirmed by hand.

    It used to post as `RULE_AUTO`, a source bank-statement auto-posting
    already owned. Sharing it meant an auto-posted supplier invoice inherited
    that source's identity everywhere downstream: the ledger labelled it
    "Bank transaction", and `resolve_ledger_entry_actions` marks `RULE_AUTO`
    uneditable, so Edit vanished from every invoice the app posted for you.
    Both were reported as separate bugs; they were one reuse.

    That it was automatic is not lost — `posted_by_rule_auto` on the draft
    records it, and the review screen shows it. It is a fact about *how the
    draft was handled*, which is where it belongs; the journal entry is a
    supplier invoice either way.
    """
    draft.status = InvoiceDraftStatus.CONFIRMED.value
    draft.confirmed_at = utcnow()
    draft.confirmed_by = actor_id
    draft.review_reason = None
    _learn_from_draft_classification(session, draft)

    if auto_posted:
        payload = dict(draft.extraction_payload or {})
        payload["posted_by_rule_auto"] = True
        draft.extraction_payload = payload

    return post_supplier_invoice_draft_to_ledger(
        session,
        entity_id,
        draft,
        expense_account_id=expense_account_id,
        actor_id=actor_id,
        journal_source=JournalEntrySource.INVOICE,
    )


def try_auto_post_supplier_draft_on_upload(
    session: Session,
    entity_id: uuid.UUID,
    draft: InvoiceDraft,
) -> bool:
    """Post immediately when setting is on and all trust gates pass; else leave draft."""
    if InvoiceKind(draft.invoice_kind) != InvoiceKind.SUPPLIER:
        return False

    if not is_invoice_supplier_auto_post_enabled(session, entity_id):
        return False

    classification_confidence = _draft_classification_confidence(draft)
    with entity_context(session, entity_id):
        expense_suggestion = (
            suggest_supplier_expense_account(session, entity_id, draft.supplier_id)
            if draft.supplier_id is not None
            else None
        )
        if not is_one_click_post_eligible(
            draft,
            classification_confidence=classification_confidence,
            expense_suggestion=expense_suggestion,
        ):
            return False

        assert expense_suggestion is not None

    try:
        with entity_context(session, entity_id):
            confirm_and_post_trusted_supplier_draft(
                session,
                entity_id,
                draft,
                expense_account_id=expense_suggestion.account_id,
                actor_id=RULE_AUTO_ACTOR_ID,
                auto_posted=True,
            )
            session.commit()
            session.refresh(draft)
        return True
    except (DraftPostError, PostingError) as exc:
        with entity_context(session, entity_id):
            draft.status = InvoiceDraftStatus.NEEDS_REVIEW.value
            draft.review_reason = f"Auto-post blocked — {exc}"
            session.commit()
            session.refresh(draft)
        return False
