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
from app.adapters.storage.local import save_upload
from app.db.session import entity_context
from app.features.entities import service as entity_service
from app.features.invoices.models import (
    InvoiceDraft,
    InvoiceDraftStatus,
    InvoiceSourceType,
)
from app.features.invoices.schema import InvoiceDraftOut
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


def extract_document(content: bytes, source_type: InvoiceSourceType) -> EInvoiceExtraction:
    if source_type == InvoiceSourceType.EFATURA_XML:
        return extract_efatura_xml(content)
    return extract_efatura_pdf(content)


def _to_out(
    draft: InvoiceDraft,
    *,
    linked_name: str | None = None,
    linked_vkn: str | None = None,
) -> InvoiceDraftOut:
    return InvoiceDraftOut(
        id=draft.id,
        entity_id=draft.entity_id,
        status=draft.status,
        source_type=draft.source_type,
        file_fingerprint=draft.file_fingerprint,
        supplier_name=draft.supplier_name,
        supplier_vkn=draft.supplier_vkn,
        supplier_id=draft.supplier_id,
        linked_supplier_name=linked_name,
        linked_supplier_vkn=linked_vkn,
        invoice_number=draft.invoice_number,
        invoice_date=draft.invoice_date,
        net_kurus=draft.net_kurus,
        gross_kurus=draft.gross_kurus,
        vat_breakdown=draft.vat_breakdown,
        currency=draft.currency,
        extraction_payload=draft.extraction_payload,
        created_at=draft.created_at,
    )


def _draft_out(session: Session, entity_id: uuid.UUID, draft: InvoiceDraft) -> InvoiceDraftOut:
    linked_name: str | None = None
    linked_vkn: str | None = None
    if draft.supplier_id is not None:
        with entity_context(session, entity_id):
            supplier = session.get(Supplier, draft.supplier_id)
            if supplier is not None:
                linked_name = supplier.name
                linked_vkn = supplier.vkn
    return _to_out(draft, linked_name=linked_name, linked_vkn=linked_vkn)


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

    supplier = supplier_service.find_by_vkn(session, entity_id, draft.supplier_vkn)
    if supplier is None:
        raise LookupError("No supplier found matching draft VKN")
    return supplier


def _ensure_draft_linkable(draft: InvoiceDraft) -> None:
    """Block link/unlink on immutable drafts (confirmed added in review slice)."""
    if hasattr(InvoiceDraftStatus, "CONFIRMED") and draft.status == InvoiceDraftStatus.CONFIRMED:
        raise DraftNotLinkableError("Confirmed drafts cannot be modified")


def _find_by_fingerprint(
    session: Session, entity_id: uuid.UUID, fingerprint: str
) -> InvoiceDraft | None:
    with entity_context(session, entity_id):
        return session.scalar(
            select(InvoiceDraft).where(InvoiceDraft.file_fingerprint == fingerprint)
        )


def create_efatura_draft_from_upload(
    session: Session,
    entity_id: uuid.UUID,
    content: bytes,
    *,
    filename: str | None = None,
    content_type: str | None = None,
) -> InvoiceDraftOut:
    _require_entity(session, entity_id)

    fingerprint = file_fingerprint(content)
    existing = _find_by_fingerprint(session, entity_id, fingerprint)
    if existing is not None:
        raise DuplicateInvoiceDraftError(existing)

    source_type = detect_source_type(content, filename=filename, content_type=content_type)

    try:
        extraction = extract_document(content, source_type)
        validate_invoice_totals(
            extraction.net_kurus, extraction.gross_kurus, extraction.vat_breakdown
        )
        status = InvoiceDraftStatus.DRAFT
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
        linked_supplier = supplier_service.find_by_vkn(
            session, entity_id, extraction.supplier_vkn
        )

    with entity_context(session, entity_id):
        draft = InvoiceDraft(
            status=status,
            source_type=source_type,
            file_fingerprint=fingerprint,
            supplier_name=extraction.supplier_name,
            supplier_vkn=extraction.supplier_vkn,
            supplier_id=linked_supplier.id if linked_supplier else None,
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


def list_invoice_drafts(session: Session, entity_id: uuid.UUID) -> tuple[list[InvoiceDraftOut], int]:
    _require_entity(session, entity_id)

    with entity_context(session, entity_id):
        total = session.scalar(select(func.count()).select_from(InvoiceDraft)) or 0
        drafts = list(
            session.scalars(
                select(InvoiceDraft).order_by(
                    InvoiceDraft.created_at.desc(),
                    InvoiceDraft.invoice_date.desc(),
                )
            )
        )

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
