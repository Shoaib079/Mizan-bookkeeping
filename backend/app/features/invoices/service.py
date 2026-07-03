"""Invoice draft intake service — read e-Fatura into draft only (no posting)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.adapters.ocr_ai.efatura import (
    EInvoiceExtraction,
    EfaturaExtractionError,
    extract_efatura_pdf_for_intake,
    extract_efatura_xml,
    extraction_to_payload,
)
from app.adapters.storage.local import delete_stored_upload, save_upload
from app.db.base import utcnow
from app.db.session import entity_context
from app.core.listing import (
    ListParams,
    amount_range_filters,
    date_range_filters,
    fetch_paginated,
    text_search_filter,
)
from app.features.entities import service as entity_service
from app.features.invoices.models import (
    InvoiceDraft,
    InvoiceDraftStatus,
    InvoiceKind,
    InvoiceSourceType,
)
from app.core.delivery.commission_detect import (
    classify_efatura_intake,
    match_delivery_platform,
)
from app.features.invoices.classification_learning import (
    classify_invoice_intake,
    learn_invoice_classification_rule,
    record_invoice_rule_correction,
)
from app.features.invoices.supplier_expense_learning import suggest_supplier_expense_account
from app.features.invoices.one_click_post import is_one_click_post_eligible
from app.features.invoices.invoice_auto_post import confirm_and_post_trusted_supplier_draft
from app.features.invoices.invoice_uniqueness import (
    duplicate_invoice_review_reason,
    live_posted_invoice_exists,
    live_posted_supplier_credit_exists,
)
from app.core.delivery.commission_posting import post_delivery_commission_draft
from app.core.invoices.posting import (
    DraftPostError,
    post_confirmed_draft,
    post_supplier_credit_draft_to_ledger,
    post_supplier_invoice_draft_to_ledger,
)
from app.features.delivery.models import OwnedDeliveryPlatform
from app.features.delivery.settings import (
    DeliveryNotEnabledError,
    is_delivery_enabled,
    require_delivery_enabled,
)
from app.features.invoices.schema import InvoiceDraftOut, PostInvoiceDraftOut
from app.features.invoices.validation import InvoiceTotalsError, validate_invoice_totals
from app.features.suppliers import service as supplier_service
from app.features.suppliers.models import Supplier


class DuplicateInvoiceDraftError(Exception):
    def __init__(self, existing: InvoiceDraft) -> None:
        self.existing = existing
        super().__init__("Duplicate invoice document for this entity")


class DraftNotLinkableError(Exception):
    """Raised when a draft cannot be linked or unlinked (e.g. confirmed)."""


class SupplierLinkError(Exception):
    """Raised when supplier link preconditions fail."""


class DraftConfirmError(Exception):
    """Raised when draft cannot be confirmed."""


class DeliveryPlatformLinkError(Exception):
    """Raised when delivery platform link preconditions fail."""


class DraftImmutableError(Exception):
    """Raised when a confirmed draft is modified."""


def _require_entity(session: Session, entity_id: uuid.UUID) -> None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")


def file_fingerprint(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def detect_source_type(
    content: bytes,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> InvoiceSourceType:
    stripped = content.lstrip()
    if stripped.startswith(b"<?xml") or stripped.startswith(b"<"):
        if b"Invoice" in content[:4096] or b"invoice" in content[:4096].lower():
            return InvoiceSourceType.EFATURA_XML
    if content.startswith(b"%PDF"):
        return InvoiceSourceType.EFATURA_PDF
    if filename:
        lower = filename.lower()
        if lower.endswith(".xml"):
            return InvoiceSourceType.EFATURA_XML
        if lower.endswith(".pdf"):
            return InvoiceSourceType.EFATURA_PDF
    if content_type:
        lower = content_type.lower()
        if "xml" in lower:
            return InvoiceSourceType.EFATURA_XML
        if "pdf" in lower:
            return InvoiceSourceType.EFATURA_PDF
    raise ValueError("Unsupported file type — expected e-Fatura XML or PDF")


def _extension_for(source_type: InvoiceSourceType) -> str:
    return ".xml" if source_type == InvoiceSourceType.EFATURA_XML else ".pdf"


def extract_document(
    content: bytes,
    source_type: InvoiceSourceType,
    *,
    buyer_vkn: str | None = None,
) -> EInvoiceExtraction:
    if source_type == InvoiceSourceType.EFATURA_XML:
        return extract_efatura_xml(content)
    return extract_efatura_pdf_for_intake(content, buyer_vkn=buyer_vkn).extraction


def _stored_document_path(draft: InvoiceDraft) -> Path | None:
    stored = (draft.extraction_payload or {}).get("stored_path")
    if not isinstance(stored, str) or not stored.strip():
        return None
    path = Path(stored).expanduser()
    return path if path.is_file() else None


def _is_classification_review_reason(reason: str | None) -> bool:
    if not reason:
        return False
    return reason.startswith("Getir invoice — confirm")


def _merge_review_reasons(*reasons: str | None) -> str | None:
    parts = [reason.strip() for reason in reasons if reason and reason.strip()]
    return "; ".join(parts) if parts else None


def _pdf_extraction_needs_review(extraction: EInvoiceExtraction) -> bool:
    raw = extraction.raw or {}
    return bool(raw.get("assumed_vat") or raw.get("net_adjusted"))


def _is_vision_extraction_payload(payload: dict) -> bool:
    raw = payload.get("raw")
    return isinstance(raw, dict) and raw.get("source") == "vision"


def _draft_classification_confidence(draft: InvoiceDraft) -> str:
    payload = draft.extraction_payload or {}
    raw = payload.get("raw")
    if isinstance(raw, dict) and raw.get("source") == "vision":
        stored = payload.get("classification_confidence")
        if stored in ("high", "medium", "low"):
            return stored
        return "medium"
    if isinstance(raw, dict) and (raw.get("assumed_vat") or raw.get("net_adjusted")):
        return "low"
    stored = payload.get("classification_confidence")
    if stored in ("high", "medium", "low"):
        return stored

    text_sample = payload.get("text_sample")
    if isinstance(text_sample, str) and text_sample.strip():
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


def _set_draft_classification_confidence(
    draft: InvoiceDraft,
    confidence: str,
) -> None:
    payload = dict(draft.extraction_payload or {})
    payload["classification_confidence"] = confidence
    draft.extraction_payload = payload


def _to_out(
    draft: InvoiceDraft,
    *,
    linked_name: str | None = None,
    linked_vkn: str | None = None,
    linked_platform_name: str | None = None,
    suggested_expense_account_id: uuid.UUID | None = None,
    expense_account_confidence: str | None = None,
    one_click_post_eligible: bool = False,
    posted_by_rule_auto: bool = False,
) -> InvoiceDraftOut:
    return InvoiceDraftOut(
        id=draft.id,
        entity_id=draft.entity_id,
        status=draft.status,
        invoice_kind=InvoiceKind(draft.invoice_kind),
        source_type=draft.source_type,
        file_fingerprint=draft.file_fingerprint,
        supplier_name=draft.supplier_name,
        supplier_vkn=draft.supplier_vkn,
        supplier_id=draft.supplier_id,
        delivery_platform_id=draft.delivery_platform_id,
        linked_supplier_name=linked_name,
        linked_supplier_vkn=linked_vkn,
        linked_platform_name=linked_platform_name,
        invoice_number=draft.invoice_number,
        referenced_invoice_number=draft.referenced_invoice_number,
        referenced_invoice_date=draft.referenced_invoice_date,
        invoice_date=draft.invoice_date,
        net_kurus=draft.net_kurus,
        gross_kurus=draft.gross_kurus,
        vat_breakdown=draft.vat_breakdown,
        currency=draft.currency,
        extraction_payload=draft.extraction_payload,
        review_reason=draft.review_reason,
        classification_confidence=_draft_classification_confidence(draft),
        confirmed_at=draft.confirmed_at,
        confirmed_by=draft.confirmed_by,
        posted_at=draft.posted_at,
        posted_by=draft.posted_by,
        journal_entry_id=draft.journal_entry_id,
        created_at=draft.created_at,
        has_stored_document=_stored_document_path(draft) is not None,
        suggested_expense_account_id=suggested_expense_account_id,
        expense_account_confidence=expense_account_confidence,
        one_click_post_eligible=one_click_post_eligible,
        posted_by_rule_auto=posted_by_rule_auto,
    )


def _draft_out(session: Session, entity_id: uuid.UUID, draft: InvoiceDraft) -> InvoiceDraftOut:
    linked_name: str | None = None
    linked_vkn: str | None = None
    linked_platform_name: str | None = None
    suggested_expense_account_id: uuid.UUID | None = None
    expense_account_confidence: str | None = None
    expense_suggestion = None
    with entity_context(session, entity_id):
        if draft.supplier_id is not None:
            supplier = session.get(Supplier, draft.supplier_id)
            if supplier is not None:
                linked_name = supplier.name
                linked_vkn = supplier.vkn
                expense_suggestion = suggest_supplier_expense_account(
                    session, entity_id, draft.supplier_id
                )
                if expense_suggestion is not None:
                    suggested_expense_account_id = expense_suggestion.account_id
                    expense_account_confidence = expense_suggestion.confidence
        if draft.delivery_platform_id is not None:
            platform = session.get(OwnedDeliveryPlatform, draft.delivery_platform_id)
            if platform is not None:
                linked_platform_name = platform.name
    classification_confidence = _draft_classification_confidence(draft)
    one_click_eligible = is_one_click_post_eligible(
        draft,
        classification_confidence=classification_confidence,
        expense_suggestion=expense_suggestion,
    )
    payload = draft.extraction_payload or {}
    posted_by_rule_auto = bool(payload.get("posted_by_rule_auto"))
    return _to_out(
        draft,
        linked_name=linked_name,
        linked_vkn=linked_vkn,
        linked_platform_name=linked_platform_name,
        suggested_expense_account_id=suggested_expense_account_id,
        expense_account_confidence=expense_account_confidence,
        one_click_post_eligible=one_click_eligible,
        posted_by_rule_auto=posted_by_rule_auto,
    )


def _get_draft_row(
    session: Session, entity_id: uuid.UUID, draft_id: uuid.UUID
) -> InvoiceDraft:
    with entity_context(session, entity_id):
        draft = session.get(InvoiceDraft, draft_id)
        if draft is None:
            raise LookupError("Invoice draft not found")
        return draft


def _resolve_supplier_for_link(
    session: Session,
    entity_id: uuid.UUID,
    draft: InvoiceDraft,
    supplier_id: uuid.UUID | None,
) -> Supplier:
    if supplier_id is not None:
        return supplier_service.get_supplier(session, entity_id, supplier_id)

    if not draft.supplier_vkn:
        raise SupplierLinkError("Draft has no supplier VKN for auto-link")

    entity = entity_service.get_entity(session, entity_id)
    supplier = supplier_service.find_or_create_supplier_for_efatura(
        session,
        entity_id,
        supplier_vkn=draft.supplier_vkn,
        supplier_name=draft.supplier_name,
        entity_vkn=entity.vkn if entity is not None else None,
    )
    if supplier is None:
        raise SupplierLinkError(
            "Extracted supplier VKN matches your company tax ID — pick a different supplier"
        )
    return supplier


def _draft_status(draft: InvoiceDraft) -> InvoiceDraftStatus:
    return InvoiceDraftStatus(draft.status)


def _ensure_draft_linkable(draft: InvoiceDraft) -> None:
    if _draft_status(draft) in {
        InvoiceDraftStatus.CONFIRMED,
        InvoiceDraftStatus.POSTED,
    }:
        raise DraftNotLinkableError("Confirmed or posted drafts cannot be modified")


def _ensure_draft_mutable(draft: InvoiceDraft) -> None:
    if _draft_status(draft) in {
        InvoiceDraftStatus.CONFIRMED,
        InvoiceDraftStatus.POSTED,
    }:
        raise DraftImmutableError("Confirmed or posted drafts are immutable")


def _find_by_fingerprint(
    session: Session, entity_id: uuid.UUID, fingerprint: str
) -> InvoiceDraft | None:
    with entity_context(session, entity_id):
        return session.scalar(
            select(InvoiceDraft).where(InvoiceDraft.file_fingerprint == fingerprint)
        )


def _extract_and_store_efatura(
    session: Session,
    entity_id: uuid.UUID,
    entity,
    content: bytes,
    fingerprint: str,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> tuple[InvoiceSourceType, EInvoiceExtraction, dict, Supplier | None, str | None]:
    source_type = detect_source_type(content, filename=filename, content_type=content_type)
    pdf_intake_review_reason: str | None = None

    if source_type == InvoiceSourceType.EFATURA_PDF:
        intake = extract_efatura_pdf_for_intake(content, buyer_vkn=entity.vkn)
        extraction = intake.extraction
        pdf_intake_review_reason = intake.review_reason
    else:
        try:
            extraction = extract_efatura_xml(content)
            validate_invoice_totals(
                extraction.net_kurus, extraction.gross_kurus, extraction.vat_breakdown
            )
        except (EfaturaExtractionError, InvoiceTotalsError) as exc:
            raise ValueError(str(exc)) from exc

    stored_path = save_upload(
        entity_id,
        fingerprint,
        content,
        extension=_extension_for(source_type),
    )

    payload = extraction_to_payload(extraction)
    payload["stored_path"] = stored_path
    if _is_vision_extraction_payload(payload):
        payload["classification_confidence"] = (
            "low" if pdf_intake_review_reason else "medium"
        )
    elif pdf_intake_review_reason or _pdf_extraction_needs_review(extraction):
        payload["classification_confidence"] = "low"

    linked_supplier: Supplier | None = None
    if extraction.supplier_vkn:
        linked_supplier = supplier_service.find_or_create_supplier_for_efatura(
            session,
            entity_id,
            supplier_vkn=extraction.supplier_vkn,
            supplier_name=extraction.supplier_name,
            entity_vkn=entity.vkn,
        )

    return source_type, extraction, payload, linked_supplier, pdf_intake_review_reason


def _draft_extraction(draft: InvoiceDraft) -> EInvoiceExtraction:
    return EInvoiceExtraction(
        supplier_name=draft.supplier_name,
        supplier_vkn=draft.supplier_vkn,
        invoice_number=draft.invoice_number,
        invoice_date=draft.invoice_date,
        net_kurus=draft.net_kurus,
        gross_kurus=draft.gross_kurus,
        vat_breakdown=draft.vat_breakdown or [],
        currency=draft.currency,
        invoice_type_code=(draft.extraction_payload or {}).get("invoice_type_code"),
        referenced_invoice_number=draft.referenced_invoice_number,
        referenced_invoice_date=draft.referenced_invoice_date,
        raw=draft.extraction_payload,
    )


def _commission_pdf_text(payload: dict) -> str | None:
    sample = payload.get("text_sample")
    return sample if isinstance(sample, str) else None


def _apply_iade_intake(
    extraction: EInvoiceExtraction,
    review_reason: str | None,
) -> tuple[str, uuid.UUID | None, str | None, str] | None:
    if (extraction.invoice_type_code or "").upper() != "IADE":
        return None
    return InvoiceKind.SUPPLIER_CREDIT.value, None, review_reason, "high"


def _apply_commission_intake(
    session: Session,
    entity_id: uuid.UUID,
    *,
    extraction: EInvoiceExtraction,
    payload: dict,
    review_reason: str | None,
) -> tuple[str, uuid.UUID | None, str | None, str]:
    """Auto-classify platform commission e-Faturas when delivery is enabled."""
    if not is_delivery_enabled(session, entity_id):
        return InvoiceKind.SUPPLIER.value, None, review_reason, "high"

    pdf_text = _commission_pdf_text(payload)
    invoice_kind, learned_platform_id, confidence, learned_review = classify_invoice_intake(
        session,
        extraction,
        pdf_text=pdf_text,
    )
    payload["classification_confidence"] = confidence

    if invoice_kind == InvoiceKind.SUPPLIER.value:
        if confidence in ("medium", "low"):
            reason = learned_review or review_reason
            return InvoiceKind.SUPPLIER.value, None, reason, confidence
        return InvoiceKind.SUPPLIER.value, None, review_reason, confidence

    if confidence in ("medium", "low"):
        reason = learned_review or review_reason
        return (
            InvoiceKind.DELIVERY_COMMISSION.value,
            None,
            reason,
            confidence,
        )

    if learned_platform_id is not None:
        return (
            InvoiceKind.DELIVERY_COMMISSION.value,
            learned_platform_id,
            review_reason,
            confidence,
        )

    platform = match_delivery_platform(
        session,
        entity_id,
        supplier_name=extraction.supplier_name,
        supplier_vkn=extraction.supplier_vkn,
    )
    if platform is None:
        reason = (
            review_reason
            or "Platform commission invoice detected — link the delivery platform before confirm"
        )
        return (
            InvoiceKind.DELIVERY_COMMISSION.value,
            None,
            reason,
            confidence,
        )

    return (
        InvoiceKind.DELIVERY_COMMISSION.value,
        platform.id,
        review_reason,
        confidence,
    )


def _learn_from_draft_classification(
    session: Session,
    draft: InvoiceDraft,
) -> None:
    """Persist owner-confirmed invoice kind after confirm or platform link."""
    payload = draft.extraction_payload or {}
    learn_invoice_classification_rule(
        session,
        extraction=_draft_extraction(draft),
        invoice_kind=draft.invoice_kind,
        delivery_platform_id=draft.delivery_platform_id,
        pdf_text=_commission_pdf_text(payload),
    )


def _discard_invoice_draft(
    session: Session,
    draft: InvoiceDraft,
) -> None:
    stored = (draft.extraction_payload or {}).get("stored_path")
    delete_stored_upload(stored if isinstance(stored, str) else None)
    session.delete(draft)


def create_efatura_draft_from_upload(
    session: Session,
    entity_id: uuid.UUID,
    content: bytes,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> InvoiceDraftOut:
    _require_entity(session, entity_id)
    entity = entity_service.get_entity(session, entity_id)
    assert entity is not None

    fingerprint = file_fingerprint(content)

    source_type, extraction, payload, linked_supplier, pdf_intake_review_reason = (
        _extract_and_store_efatura(
        session,
        entity_id,
        entity,
        content,
        fingerprint,
        filename=filename,
        content_type=content_type,
        )
    )

    review_reason: str | None = pdf_intake_review_reason
    if linked_supplier is None and extraction.supplier_vkn:
        if entity.vkn and extraction.supplier_vkn == entity.vkn:
            review_reason = _merge_review_reasons(
                review_reason,
                "Extracted supplier VKN matches your company tax ID — "
                "link the correct supplier before confirm",
            )
    elif linked_supplier is None and not extraction.supplier_vkn:
        review_reason = _merge_review_reasons(
            review_reason,
            "Could not extract supplier VKN from this document — "
            "create or link a supplier before confirm",
        )

    invoice_kind, delivery_platform_id, review_reason, _confidence = (
        _apply_iade_intake(extraction, review_reason)
        or _apply_commission_intake(
            session,
            entity_id,
            extraction=extraction,
            payload=payload,
            review_reason=review_reason,
        )
    )
    if (extraction.invoice_type_code or "").upper() == "IADE":
        payload["classification_confidence"] = _confidence

    if invoice_kind == InvoiceKind.DELIVERY_COMMISSION.value:
        if delivery_platform_id is not None:
            review_reason = None
        else:
            review_reason = (
                "Platform commission invoice detected — "
                "link the delivery platform before confirm"
            )

    supplier_id_for_draft = linked_supplier.id if linked_supplier else None
    duplicate_of_posted = False
    with entity_context(session, entity_id):
        if (
            invoice_kind == InvoiceKind.SUPPLIER.value
            and supplier_id_for_draft is not None
            and live_posted_invoice_exists(
                session,
                entity_id,
                supplier_id_for_draft,
                extraction.invoice_number,
            )
        ):
            duplicate_of_posted = True
        elif (
            invoice_kind == InvoiceKind.SUPPLIER_CREDIT.value
            and supplier_id_for_draft is not None
            and live_posted_supplier_credit_exists(
                session,
                entity_id,
                supplier_id_for_draft,
                extraction.invoice_number,
            )
        ):
            duplicate_of_posted = True

    draft_fingerprint = fingerprint
    if duplicate_of_posted:
        draft_fingerprint = hashlib.sha256(
            f"{fingerprint}:num-dup:{uuid.uuid4()}".encode()
        ).hexdigest()
    else:
        existing = _find_by_fingerprint(session, entity_id, fingerprint)
        if existing is not None:
            if _draft_status(existing) == InvoiceDraftStatus.REJECTED:
                with entity_context(session, entity_id):
                    _discard_invoice_draft(session, existing)
                    session.commit()
            else:
                raise DuplicateInvoiceDraftError(existing)

    if duplicate_of_posted:
        initial_status = InvoiceDraftStatus.DUPLICATE
        review_reason = duplicate_invoice_review_reason(extraction.invoice_number)
    else:
        initial_status = (
            InvoiceDraftStatus.NEEDS_REVIEW if review_reason else InvoiceDraftStatus.DRAFT
        )
    with entity_context(session, entity_id):
        draft = InvoiceDraft(
            status=initial_status.value,
            invoice_kind=invoice_kind,
            source_type=source_type,
            file_fingerprint=draft_fingerprint,
            supplier_name=extraction.supplier_name,
            supplier_vkn=extraction.supplier_vkn,
            supplier_id=linked_supplier.id if linked_supplier else None,
            delivery_platform_id=delivery_platform_id,
            review_reason=review_reason,
            invoice_number=extraction.invoice_number,
            referenced_invoice_number=extraction.referenced_invoice_number,
            referenced_invoice_date=extraction.referenced_invoice_date,
            invoice_date=extraction.invoice_date,
            net_kurus=extraction.net_kurus,
            gross_kurus=extraction.gross_kurus,
            vat_breakdown=extraction.vat_breakdown,
            currency=extraction.currency,
            extraction_payload=payload,
        )
        session.add(draft)
        session.commit()
        session.refresh(draft)

    from app.features.invoices.invoice_auto_post import try_auto_post_supplier_draft_on_upload

    if not duplicate_of_posted:
        try_auto_post_supplier_draft_on_upload(session, entity_id, draft)

    return _draft_out(session, entity_id, draft)


def get_invoice_draft_document_path(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
) -> tuple[Path, str]:
    draft = _get_draft_row(session, entity_id, draft_id)
    path = _stored_document_path(draft)
    if path is None:
        raise LookupError("Invoice document not found")
    media = (
        "application/xml"
        if draft.source_type == InvoiceSourceType.EFATURA_XML
        else "application/pdf"
    )
    return path, media


def list_invoice_drafts(
    session: Session,
    entity_id: uuid.UUID,
    *,
    status: InvoiceDraftStatus | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    q: str | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    supplier_id: uuid.UUID | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[InvoiceDraftOut], int]:
    _require_entity(session, entity_id)
    params = list_params or ListParams()

    with entity_context(session, entity_id):
        filters = []
        if status is not None:
            filters.append(InvoiceDraft.status == status)
        if supplier_id is not None:
            filters.append(InvoiceDraft.supplier_id == supplier_id)
        filters.extend(
            date_range_filters(
                InvoiceDraft.invoice_date, from_date=from_date, to_date=to_date
            )
        )
        filters.extend(
            amount_range_filters(
                InvoiceDraft.gross_kurus,
                min_amount=min_amount,
                max_amount=max_amount,
            )
        )
        search = text_search_filter(
            q, InvoiceDraft.supplier_name, InvoiceDraft.invoice_number
        )
        if search is not None:
            filters.append(search)

        stmt = select(InvoiceDraft).where(*filters).order_by(
            InvoiceDraft.created_at.desc(),
            InvoiceDraft.invoice_date.desc(),
        )
        drafts, total = fetch_paginated(session, stmt, params)

    return [_draft_out(session, entity_id, draft) for draft in drafts], total


def get_invoice_draft(
    session: Session, entity_id: uuid.UUID, draft_id: uuid.UUID
) -> InvoiceDraftOut:
    _require_entity(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    return _draft_out(session, entity_id, draft)


def link_supplier_to_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    *,
    supplier_id: uuid.UUID | None = None,
) -> InvoiceDraftOut:
    _require_entity(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    _ensure_draft_linkable(draft)

    supplier = _resolve_supplier_for_link(session, entity_id, draft, supplier_id)

    with entity_context(session, entity_id):
        draft.supplier_id = supplier.id
        if (
            InvoiceKind(draft.invoice_kind) == InvoiceKind.SUPPLIER
            and live_posted_invoice_exists(
                session,
                entity_id,
                supplier.id,
                draft.invoice_number,
                exclude_draft_id=draft.id,
            )
        ):
            draft.status = InvoiceDraftStatus.DUPLICATE.value
            draft.review_reason = duplicate_invoice_review_reason(draft.invoice_number)
        elif (
            InvoiceKind(draft.invoice_kind) == InvoiceKind.SUPPLIER_CREDIT
            and live_posted_supplier_credit_exists(
                session,
                entity_id,
                supplier.id,
                draft.invoice_number,
                exclude_draft_id=draft.id,
            )
        ):
            draft.status = InvoiceDraftStatus.DUPLICATE.value
            draft.review_reason = duplicate_invoice_review_reason(draft.invoice_number)
        session.commit()
        session.refresh(draft)

    return _draft_out(session, entity_id, draft)


def unlink_supplier_from_draft(
    session: Session, entity_id: uuid.UUID, draft_id: uuid.UUID
) -> InvoiceDraftOut:
    _require_entity(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    _ensure_draft_linkable(draft)

    with entity_context(session, entity_id):
        draft.supplier_id = None
        session.commit()
        session.refresh(draft)

    return _draft_out(session, entity_id, draft)


def link_delivery_platform_to_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    *,
    delivery_platform_id: uuid.UUID,
) -> InvoiceDraftOut:
    _require_entity(session, entity_id)
    require_delivery_enabled(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    _ensure_draft_linkable(draft)

    with entity_context(session, entity_id):
        platform = session.get(OwnedDeliveryPlatform, delivery_platform_id)
        if platform is None:
            raise LookupError("Delivery platform not found")
        if not platform.is_active:
            raise DeliveryPlatformLinkError("Delivery platform is inactive")

        draft.delivery_platform_id = delivery_platform_id
        if _draft_status(draft) == InvoiceDraftStatus.NEEDS_REVIEW:
            draft.status = InvoiceDraftStatus.DRAFT.value
        if draft.invoice_kind == InvoiceKind.DELIVERY_COMMISSION.value:
            draft.review_reason = None
        _learn_from_draft_classification(session, draft)

        session.commit()
        session.refresh(draft)

    return _draft_out(session, entity_id, draft)


def unlink_delivery_platform_from_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
) -> InvoiceDraftOut:
    _require_entity(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    _ensure_draft_linkable(draft)

    with entity_context(session, entity_id):
        before_kind = draft.invoice_kind
        before_platform_id = draft.delivery_platform_id
        draft.invoice_kind = InvoiceKind.SUPPLIER.value
        draft.delivery_platform_id = None
        if _draft_status(draft) == InvoiceDraftStatus.NEEDS_REVIEW:
            draft.status = InvoiceDraftStatus.DRAFT.value
            draft.review_reason = None
        if before_kind != InvoiceKind.SUPPLIER.value:
            record_invoice_rule_correction(
                session,
                extraction=_draft_extraction(draft),
                before_kind=before_kind,
                corrected_kind=InvoiceKind.SUPPLIER.value,
                before_platform_id=before_platform_id,
                corrected_platform_id=None,
                pdf_text=_commission_pdf_text(draft.extraction_payload or {}),
                source_id=draft.id,
            )
        session.commit()
        session.refresh(draft)

    return _draft_out(session, entity_id, draft)


def confirm_invoice_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
) -> InvoiceDraftOut:
    _require_entity(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    if _draft_status(draft) not in {InvoiceDraftStatus.DRAFT, InvoiceDraftStatus.NEEDS_REVIEW}:
        raise DraftConfirmError(
            f"Draft status {_draft_status(draft).value!r} cannot be confirmed"
        )
    if InvoiceKind(draft.invoice_kind) == InvoiceKind.DELIVERY_COMMISSION:
        if draft.delivery_platform_id is None:
            raise DraftConfirmError("Delivery platform must be linked before confirm")
    else:
        if draft.supplier_id is None:
            raise DraftConfirmError("Supplier must be linked before confirm")

    with entity_context(session, entity_id):
        draft.status = InvoiceDraftStatus.CONFIRMED
        draft.confirmed_at = utcnow()
        draft.confirmed_by = actor_id
        draft.review_reason = None
        _learn_from_draft_classification(session, draft)
        session.commit()
        session.refresh(draft)

    return _draft_out(session, entity_id, draft)


def unconfirm_invoice_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
) -> InvoiceDraftOut:
    _require_entity(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    status = _draft_status(draft)
    if status != InvoiceDraftStatus.CONFIRMED:
        raise DraftConfirmError(
            f"Draft status {status.value!r} cannot be sent back to review"
        )

    kind = InvoiceKind(draft.invoice_kind)
    review_reason = reason or "Sent back to review"
    if kind == InvoiceKind.DELIVERY_COMMISSION and draft.delivery_platform_id is None:
        next_status = InvoiceDraftStatus.NEEDS_REVIEW
        review_reason = (
            reason
            or "Platform commission invoice — link the delivery platform before confirm"
        )
    elif kind == InvoiceKind.SUPPLIER and draft.supplier_id is None:
        next_status = InvoiceDraftStatus.NEEDS_REVIEW
        review_reason = reason or "Link a supplier before confirm"
    else:
        next_status = InvoiceDraftStatus.DRAFT
        if reason:
            review_reason = reason
        else:
            review_reason = None

    with entity_context(session, entity_id):
        draft.status = next_status.value
        draft.confirmed_at = None
        draft.confirmed_by = None
        draft.review_reason = review_reason
        session.commit()
        session.refresh(draft)

    return _draft_out(session, entity_id, draft)


def set_invoice_draft_kind(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    *,
    invoice_kind: InvoiceKind,
) -> InvoiceDraftOut:
    _require_entity(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    _ensure_draft_linkable(draft)

    if invoice_kind == InvoiceKind.DELIVERY_COMMISSION:
        require_delivery_enabled(session, entity_id)

    with entity_context(session, entity_id):
        before_kind = draft.invoice_kind
        before_platform_id = draft.delivery_platform_id
        _set_draft_classification_confidence(draft, "high")

        if invoice_kind == InvoiceKind.SUPPLIER:
            draft.invoice_kind = InvoiceKind.SUPPLIER.value
            draft.delivery_platform_id = None
            if draft.supplier_id is None:
                draft.status = InvoiceDraftStatus.NEEDS_REVIEW.value
                draft.review_reason = (
                    draft.review_reason or "Link a supplier before confirm"
                )
            else:
                draft.status = InvoiceDraftStatus.DRAFT.value
                if _is_classification_review_reason(draft.review_reason):
                    draft.review_reason = None
        elif invoice_kind == InvoiceKind.DELIVERY_COMMISSION:
            draft.invoice_kind = InvoiceKind.DELIVERY_COMMISSION.value
            if draft.delivery_platform_id is None:
                draft.status = InvoiceDraftStatus.NEEDS_REVIEW.value
                draft.review_reason = (
                    "Platform commission invoice — "
                    "link the delivery platform before confirm"
                )
            else:
                draft.status = InvoiceDraftStatus.DRAFT.value
                if _is_classification_review_reason(draft.review_reason):
                    draft.review_reason = None
        if (
            before_kind != draft.invoice_kind
            or before_platform_id != draft.delivery_platform_id
        ):
            record_invoice_rule_correction(
                session,
                extraction=_draft_extraction(draft),
                before_kind=before_kind,
                corrected_kind=draft.invoice_kind,
                before_platform_id=before_platform_id,
                corrected_platform_id=draft.delivery_platform_id,
                pdf_text=_commission_pdf_text(draft.extraction_payload or {}),
                source_id=draft.id,
            )
        session.commit()
        session.refresh(draft)

    return _draft_out(session, entity_id, draft)


def reject_invoice_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    *,
    reason: str | None = None,
) -> None:
    _require_entity(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    status = _draft_status(draft)
    if status == InvoiceDraftStatus.DUPLICATE:
        with entity_context(session, entity_id):
            _discard_invoice_draft(session, draft)
            session.commit()
        return
    if status == InvoiceDraftStatus.CONFIRMED:
        with entity_context(session, entity_id):
            _discard_invoice_draft(session, draft)
            session.commit()
        return
    _ensure_draft_mutable(draft)
    if status not in {
        InvoiceDraftStatus.DRAFT,
        InvoiceDraftStatus.NEEDS_REVIEW,
    }:
        raise DraftConfirmError(f"Draft status {status.value!r} cannot be rejected")

    with entity_context(session, entity_id):
        _discard_invoice_draft(session, draft)
        session.commit()


def confirm_and_post_supplier_invoice_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    *,
    expense_account_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> PostInvoiceDraftOut:
    """Confirm and post a trusted supplier invoice in one transaction."""
    _require_entity(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    with entity_context(session, entity_id):
        expense_suggestion = (
            suggest_supplier_expense_account(session, entity_id, draft.supplier_id)
            if draft.supplier_id is not None
            else None
        )
        classification_confidence = _draft_classification_confidence(draft)
        if not is_one_click_post_eligible(
            draft,
            classification_confidence=classification_confidence,
            expense_suggestion=expense_suggestion,
        ):
            raise DraftConfirmError("Invoice is not eligible for one-click post")

        if _draft_status(draft) not in {
            InvoiceDraftStatus.DRAFT,
            InvoiceDraftStatus.NEEDS_REVIEW,
        }:
            raise DraftConfirmError(
                f"Draft status {_draft_status(draft).value!r} cannot be one-click posted"
            )

        assert expense_suggestion is not None

        result = confirm_and_post_trusted_supplier_draft(
            session,
            entity_id,
            draft,
            expense_account_id=expense_account_id,
            actor_id=actor_id,
        )
        journal_entry_id = result.journal_entry.id
        journal_entry_date = result.journal_entry.entry_date
        journal_entry_description = result.journal_entry.description
        journal_entry_source = result.journal_entry.source
        supplier_ledger_entry_id = result.supplier_ledger_entry.id
        payable_balance_kurus = result.payable_balance_kurus
        session.commit()
        session.refresh(draft)

    return PostInvoiceDraftOut(
        draft=_draft_out(session, entity_id, draft),
        journal_entry_id=journal_entry_id,
        journal_entry_date=journal_entry_date,
        journal_entry_description=journal_entry_description,
        journal_entry_source=journal_entry_source,
        supplier_ledger_entry_id=supplier_ledger_entry_id,
        payable_balance_kurus=payable_balance_kurus,
    )


def post_invoice_draft(
    session: Session,
    entity_id: uuid.UUID,
    draft_id: uuid.UUID,
    *,
    expense_account_id: uuid.UUID,
    actor_id: uuid.UUID,
) -> PostInvoiceDraftOut:
    _require_entity(session, entity_id)

    draft = _get_draft_row(session, entity_id, draft_id)
    if InvoiceKind(draft.invoice_kind) == InvoiceKind.DELIVERY_COMMISSION:
        require_delivery_enabled(session, entity_id)
        result = post_delivery_commission_draft(
            session,
            entity_id,
            draft_id,
            expense_account_id=expense_account_id,
            actor_id=actor_id,
        )
        draft = _get_draft_row(session, entity_id, draft_id)
        return PostInvoiceDraftOut(
            draft=_draft_out(session, entity_id, draft),
            journal_entry_id=result.journal_entry.id,
            journal_entry_date=result.journal_entry.entry_date,
            journal_entry_description=result.journal_entry.description,
            journal_entry_source=result.journal_entry.source,
            delivery_platform_id=result.delivery_platform_id,
        )

    if InvoiceKind(draft.invoice_kind) == InvoiceKind.SUPPLIER_CREDIT:
        with entity_context(session, entity_id):
            draft = _get_draft_row(session, entity_id, draft_id)
            status = _draft_status(draft)
            if status == InvoiceDraftStatus.POSTED:
                raise DraftPostError("Draft is already posted")
            if status != InvoiceDraftStatus.CONFIRMED:
                raise DraftPostError(
                    f"Draft status {status.value!r} must be confirmed to post"
                )
            result = post_supplier_credit_draft_to_ledger(
                session,
                entity_id,
                draft,
                expense_account_id=expense_account_id,
                actor_id=actor_id,
            )
            session.commit()
            session.refresh(result.journal_entry)
            session.refresh(result.supplier_ledger_entry)
            session.refresh(draft)
        return PostInvoiceDraftOut(
            draft=_draft_out(session, entity_id, draft),
            journal_entry_id=result.journal_entry.id,
            journal_entry_date=result.journal_entry.entry_date,
            journal_entry_description=result.journal_entry.description,
            journal_entry_source=result.journal_entry.source,
            supplier_ledger_entry_id=result.supplier_ledger_entry.id,
            payable_balance_kurus=result.payable_balance_kurus,
        )

    result = post_confirmed_draft(
        session,
        entity_id,
        draft_id,
        expense_account_id=expense_account_id,
        actor_id=actor_id,
    )
    draft = _get_draft_row(session, entity_id, draft_id)
    return PostInvoiceDraftOut(
        draft=_draft_out(session, entity_id, draft),
        journal_entry_id=result.journal_entry.id,
        journal_entry_date=result.journal_entry.entry_date,
        journal_entry_description=result.journal_entry.description,
        journal_entry_source=result.journal_entry.source,
        supplier_ledger_entry_id=result.supplier_ledger_entry.id,
        payable_balance_kurus=result.payable_balance_kurus,
    )
