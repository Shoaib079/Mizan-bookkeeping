"""Supplier invoice number uniqueness — live posted guard (Decisions §7)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind


class DuplicateInvoiceNumberError(ValueError):
    """Another live posted invoice already uses this supplier + invoice number."""


def normalize_invoice_number(value: str) -> str:
    """Strip whitespace and casefold for deterministic comparison."""
    return value.strip().casefold()


def find_live_posted_supplier_invoice(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    invoice_number: str,
    *,
    exclude_draft_id: uuid.UUID | None = None,
) -> InvoiceDraft | None:
    """Return a live posted supplier draft for (entity, supplier, invoice_number), if any.

    Live = draft status posted and linked journal entry status posted (not voided).
    """
    normalized = normalize_invoice_number(invoice_number)
    stmt = (
        select(InvoiceDraft)
        .join(JournalEntry, InvoiceDraft.journal_entry_id == JournalEntry.id)
        .where(
            InvoiceDraft.entity_id == entity_id,
            InvoiceDraft.supplier_id == supplier_id,
            InvoiceDraft.invoice_kind == InvoiceKind.SUPPLIER.value,
            InvoiceDraft.status == InvoiceDraftStatus.POSTED.value,
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            func.lower(func.trim(InvoiceDraft.invoice_number)) == normalized,
        )
    )
    if exclude_draft_id is not None:
        stmt = stmt.where(InvoiceDraft.id != exclude_draft_id)

    candidates = list(session.scalars(stmt))
    for draft in candidates:
        if normalize_invoice_number(draft.invoice_number) == normalized:
            return draft
    return None


def find_live_posted_supplier_credit_note(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    invoice_number: str,
    *,
    exclude_draft_id: uuid.UUID | None = None,
) -> InvoiceDraft | None:
    """Return a live posted supplier credit note for (entity, supplier, invoice_number), if any."""
    normalized = normalize_invoice_number(invoice_number)
    stmt = (
        select(InvoiceDraft)
        .join(JournalEntry, InvoiceDraft.journal_entry_id == JournalEntry.id)
        .where(
            InvoiceDraft.entity_id == entity_id,
            InvoiceDraft.supplier_id == supplier_id,
            InvoiceDraft.invoice_kind == InvoiceKind.SUPPLIER_CREDIT.value,
            InvoiceDraft.status == InvoiceDraftStatus.POSTED.value,
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            func.lower(func.trim(InvoiceDraft.invoice_number)) == normalized,
        )
    )
    if exclude_draft_id is not None:
        stmt = stmt.where(InvoiceDraft.id != exclude_draft_id)

    candidates = list(session.scalars(stmt))
    for draft in candidates:
        if normalize_invoice_number(draft.invoice_number) == normalized:
            return draft
    return None


def live_posted_supplier_credit_exists(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    invoice_number: str,
    *,
    exclude_draft_id: uuid.UUID | None = None,
) -> bool:
    return (
        find_live_posted_supplier_credit_note(
            session,
            entity_id,
            supplier_id,
            invoice_number,
            exclude_draft_id=exclude_draft_id,
        )
        is not None
    )


def live_posted_invoice_exists(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    invoice_number: str,
    *,
    exclude_draft_id: uuid.UUID | None = None,
) -> bool:
    return (
        find_live_posted_supplier_invoice(
            session,
            entity_id,
            supplier_id,
            invoice_number,
            exclude_draft_id=exclude_draft_id,
        )
        is not None
    )


def duplicate_invoice_review_reason(invoice_number: str) -> str:
    return (
        f"Supplier already has a posted invoice with number {invoice_number!r} — "
        "discard this duplicate or correct the existing invoice"
    )
