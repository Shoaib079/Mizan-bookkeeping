"""Invoice draft intake service — read e-Fatura into draft only (no posting)."""

from __future__ import annotations

import hashlib
import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.adapters.ocr_ai.efatura import (
    EInvoiceExtraction,
    EfaturaExtractionError,
    EfaturaPdfUnsupportedError,
    extract_efatura_pdf,
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
    is_delivery_commission_extraction,
    match_delivery_platform,
)
from app.core.delivery.commission_posting import post_delivery_commission_draft
from app.core.invoices.posting import DraftPostError, post_confirmed_draft
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
    return extract_efatura_pdf(content, buyer_vkn=buyer_vkn)


def _to_out(
    draft: InvoiceDraft,
    *,
    linked_name: str | None = None,
    linked_vkn: str | None = None,
    linked_platform_name: str | None = None,
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
        invoice_date=draft.invoice_date,
        net_kurus=draft.net_kurus,
        gross_kurus=draft.gross_kurus,
        vat_breakdown=draft.vat_breakdown,
        currency=draft.currency,
        extraction_payload=draft.extraction_payload,
        review_reason=draft.review_reason,
        confirmed_at=draft.confirmed_at,
        confirmed_by=draft.confirmed_by,
        posted_at=draft.posted_at,
        posted_by=draft.posted_by,
        journal_entry_id=draft.journal_entry_id,
        created_at=draft.created_at,
    )


def _draft_out(session: Session, entity_id: uuid.UUID, draft: InvoiceDraft) -> InvoiceDraftOut:
    linked_name: str | None = None
    linked_vkn: str | None = None
    linked_platform_name: str | None = None
    with entity_context(session, entity_id):
        if draft.supplier_id is not None:
            supplier = session.get(Supplier, draft.supplier_id)
            if supplier is not None:
                linked_name = supplier.name
                linked_vkn = supplier.vkn
        if draft.delivery_platform_id is not None:
            platform = session.get(OwnedDeliveryPlatform, draft.delivery_platform_id)
            if platform is not None:
                linked_platform_name = platform.name
    return _to_out(
        draft,
        linked_name=linked_name,
        linked_vkn=linked_vkn,
        linked_platform_name=linked_platform_name,
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
) -> tuple[InvoiceSourceType, EInvoiceExtraction, dict, Supplier | None]:
    source_type = detect_source_type(content, filename=filename, content_type=content_type)

    try:
        extraction = extract_document(
            content, source_type, buyer_vkn=entity.vkn
        )
        validate_invoice_totals(
            extraction.net_kurus, extraction.gross_kurus, extraction.vat_breakdown
        )
    except EfaturaPdfUnsupportedError as exc:
        raise exc
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

    linked_supplier: Supplier | None = None
    if extraction.supplier_vkn:
        linked_supplier = supplier_service.find_or_create_supplier_for_efatura(
            session,
            entity_id,
            supplier_vkn=extraction.supplier_vkn,
            supplier_name=extraction.supplier_name,
            entity_vkn=entity.vkn,
        )

    return source_type, extraction, payload, linked_supplier


def _commission_pdf_text(payload: dict) -> str | None:
    sample = payload.get("text_sample")
    return sample if isinstance(sample, str) else None


def _apply_commission_intake(
    session: Session,
    entity_id: uuid.UUID,
    *,
    extraction: EInvoiceExtraction,
    payload: dict,
    review_reason: str | None,
) -> tuple[str, uuid.UUID | None, str | None]:
    """Auto-classify platform commission e-Faturas when delivery is enabled."""
    if not is_delivery_enabled(session, entity_id):
        return InvoiceKind.SUPPLIER.value, None, review_reason

    pdf_text = _commission_pdf_text(payload)
    if not is_delivery_commission_extraction(extraction, pdf_text=pdf_text):
        return InvoiceKind.SUPPLIER.value, None, review_reason

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
        return InvoiceKind.DELIVERY_COMMISSION.value, None, reason

    return InvoiceKind.DELIVERY_COMMISSION.value, platform.id, review_reason


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
    existing = _find_by_fingerprint(session, entity_id, fingerprint)
    if existing is not None:
        if _draft_status(existing) == InvoiceDraftStatus.REJECTED:
            with entity_context(session, entity_id):
                _discard_invoice_draft(session, existing)
                session.commit()
        else:
            raise DuplicateInvoiceDraftError(existing)

    source_type, extraction, payload, linked_supplier = _extract_and_store_efatura(
        session,
        entity_id,
        entity,
        content,
        fingerprint,
        filename=filename,
        content_type=content_type,
    )

    review_reason: str | None = None
    if linked_supplier is None and extraction.supplier_vkn:
        if entity.vkn and extraction.supplier_vkn == entity.vkn:
            review_reason = (
                "Extracted supplier VKN matches your company tax ID — "
                "link the correct supplier before confirm"
            )
    elif linked_supplier is None and not extraction.supplier_vkn:
        review_reason = (
            "Could not extract supplier VKN from this document — "
            "create or link a supplier before confirm"
        )

    invoice_kind, delivery_platform_id, review_reason = _apply_commission_intake(
        session,
        entity_id,
        extraction=extraction,
        payload=payload,
        review_reason=review_reason,
    )

    with entity_context(session, entity_id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.DRAFT,
            invoice_kind=invoice_kind,
            source_type=source_type,
            file_fingerprint=fingerprint,
            supplier_name=extraction.supplier_name,
            supplier_vkn=extraction.supplier_vkn,
            supplier_id=linked_supplier.id if linked_supplier else None,
            delivery_platform_id=delivery_platform_id,
            review_reason=review_reason,
            invoice_number=extraction.invoice_number,
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

    return _draft_out(session, entity_id, draft)


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

        draft.invoice_kind = InvoiceKind.DELIVERY_COMMISSION.value
        draft.delivery_platform_id = delivery_platform_id
        if _draft_status(draft) == InvoiceDraftStatus.NEEDS_REVIEW and (
            draft.review_reason or ""
        ).startswith("Platform commission invoice detected"):
            draft.status = InvoiceDraftStatus.DRAFT.value
            draft.review_reason = None

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
        draft.invoice_kind = InvoiceKind.SUPPLIER.value
        draft.delivery_platform_id = None
        if _draft_status(draft) == InvoiceDraftStatus.NEEDS_REVIEW:
            draft.status = InvoiceDraftStatus.DRAFT.value
            draft.review_reason = None
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
    if draft.supplier_id is None:
        raise DraftConfirmError("Supplier must be linked before confirm")
    if InvoiceKind(draft.invoice_kind) == InvoiceKind.DELIVERY_COMMISSION:
        if draft.delivery_platform_id is None:
            raise DraftConfirmError("Delivery platform must be linked before confirm")
        if _draft_status(draft) == InvoiceDraftStatus.NEEDS_REVIEW:
            raise DraftConfirmError(
                draft.review_reason or "Draft needs review before confirm"
            )

    with entity_context(session, entity_id):
        draft.status = InvoiceDraftStatus.CONFIRMED
        draft.confirmed_at = utcnow()
        draft.confirmed_by = actor_id
        draft.review_reason = None
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
    _ensure_draft_mutable(draft)
    status = _draft_status(draft)
    if status == InvoiceDraftStatus.DUPLICATE:
        raise DraftConfirmError("Duplicate drafts cannot be rejected")
    if status not in {
        InvoiceDraftStatus.DRAFT,
        InvoiceDraftStatus.NEEDS_REVIEW,
        InvoiceDraftStatus.REJECTED,
    }:
        raise DraftConfirmError(f"Draft status {status.value!r} cannot be rejected")

    with entity_context(session, entity_id):
        _discard_invoice_draft(session, draft)
        session.commit()


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
