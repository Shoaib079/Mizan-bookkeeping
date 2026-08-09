"""Invoice number uniqueness — one live-posted guard for every kind (Decisions §7).

The rule the owner states plainly: *"if one invoice or receipt or delivery
invoice etc already exists app does not re post it."*

It used to be written twice — once for supplier invoices, once for credit
notes — and then branched on by hand at four call sites. Delivery commissions
were in none of them, so the same commission invoice could be posted twice as
long as the file bytes differed, which a re-downloaded PDF usually does. The
`_COUNTERPARTY_FIELD` map below is now the single place that knows how a
duplicate is recognised, and it raises on a kind it has not been told about
rather than quietly finding nothing.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind


class DuplicateInvoiceNumberError(ValueError):
    """Another live posted invoice already uses this supplier + invoice number."""


class UnknownInvoiceKindError(ValueError):
    """An invoice kind exists that nobody decided a duplicate rule for."""


# What names the other party to the invoice, per kind. A map rather than a
# chain of `if kind ==` because the chain silently does nothing for a kind it
# was not told about — which is exactly how delivery commissions went a year
# without a duplicate check. Add a fourth kind and this raises the first time
# anything tries to post one, which is a far better day than discovering it in
# the books.
_COUNTERPARTY_FIELD: dict[InvoiceKind, str] = {
    InvoiceKind.SUPPLIER: "supplier_id",
    InvoiceKind.SUPPLIER_CREDIT: "supplier_id",
    InvoiceKind.DELIVERY_COMMISSION: "delivery_platform_id",
}


def counterparty_field_for(kind: InvoiceKind | str) -> str:
    """Which draft column identifies the other party, for this kind."""
    try:
        return _COUNTERPARTY_FIELD[InvoiceKind(kind)]
    except (KeyError, ValueError) as exc:
        raise UnknownInvoiceKindError(
            f"invoice kind {kind!r} has no duplicate rule — add it to "
            "_COUNTERPARTY_FIELD in invoice_uniqueness.py, naming the column "
            "that identifies who the invoice is from"
        ) from exc


def normalize_invoice_number(value: str) -> str:
    """Strip whitespace and casefold for deterministic comparison."""
    return value.strip().casefold()


def find_live_posted_invoice(
    session: Session,
    entity_id: uuid.UUID,
    *,
    kind: InvoiceKind | str,
    counterparty_id: uuid.UUID | None,
    invoice_number: str | None,
    exclude_draft_id: uuid.UUID | None = None,
) -> InvoiceDraft | None:
    """An invoice of this kind, from this party, with this number, still in the books.

    Live = the draft reads posted *and* its journal entry is still posted. A
    voided invoice is not a duplicate: the whole point of voiding one booked
    twice is to be able to book the right one.

    Returns the offending draft rather than a bool so the caller can say which
    invoice it clashes with. "Duplicate" with nothing to point at is what sent
    someone re-uploading to find out whether the first one went through.
    """
    field = counterparty_field_for(kind)
    normalized = normalize_invoice_number(invoice_number or "")
    if not normalized or counterparty_id is None:
        # Nothing to compare on. An unlinked or unnumbered draft cannot be
        # judged a duplicate here; the posting paths refuse it separately for
        # not having a counterparty at all.
        return None

    stmt = (
        select(InvoiceDraft)
        .join(JournalEntry, InvoiceDraft.journal_entry_id == JournalEntry.id)
        .where(
            InvoiceDraft.entity_id == entity_id,
            getattr(InvoiceDraft, field) == counterparty_id,
            InvoiceDraft.invoice_kind == InvoiceKind(kind).value,
            InvoiceDraft.status == InvoiceDraftStatus.POSTED.value,
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            func.lower(func.trim(InvoiceDraft.invoice_number)) == normalized,
        )
    )
    if exclude_draft_id is not None:
        stmt = stmt.where(InvoiceDraft.id != exclude_draft_id)

    for draft in session.scalars(stmt):
        # Re-checked in Python: the SQL comparison and `normalize_invoice_number`
        # must agree, and only one of them can be trusted to stay in step.
        if normalize_invoice_number(draft.invoice_number) == normalized:
            return draft
    return None


def find_live_posted_duplicate_of(
    session: Session,
    entity_id: uuid.UUID,
    draft: InvoiceDraft,
) -> InvoiceDraft | None:
    """The same invoice, already in the books, whatever kind this draft is.

    The form the posting paths want: hand it a draft, get back the invoice it
    would duplicate. No caller has to know which column identifies the party
    for its kind, which is what four hand-written branches got wrong.
    """
    kind = InvoiceKind(draft.invoice_kind)
    return find_live_posted_invoice(
        session,
        entity_id,
        kind=kind,
        counterparty_id=getattr(draft, counterparty_field_for(kind)),
        invoice_number=draft.invoice_number,
        exclude_draft_id=draft.id,
    )


# `find_live_posted_supplier_credit_note`, `live_posted_invoice_exists` and
# `live_posted_supplier_credit_exists` were deleted here rather than left as
# unused wrappers. Each was a per-kind name for the one question above, and
# having a name per kind is what made it possible to add a kind and answer it
# for none of them.


def duplicate_invoice_review_reason(invoice_number: str) -> str:
    return (
        f"Supplier already has a posted invoice with number {invoice_number!r} — "
        "discard this duplicate or correct the existing invoice"
    )
