"""Handing an invoice draft back when its posting is undone.

Lifted verbatim from `correction.py` when it was split.

Its own module because three flows need it and they are not in one domain: a
supplier invoice, a supplier credit note and a delivery commission all carry
a draft, and each must release it when its entry is voided. Left inside any
one of those, the other two would import across a boundary with no reason to
exist.

The first attempt at this split put these with the delivery-commission code,
and `suppliers.py` came out referencing a helper it could not see. It
compiled. It would have raised NameError the first time anyone voided a
supplier invoice.
"""

from __future__ import annotations

from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind
from sqlalchemy import select
from sqlalchemy.orm import Session
import uuid


def _delivery_commission_draft(
    session: Session, journal_entry_id: uuid.UUID
) -> InvoiceDraft:
    draft = session.scalar(
        select(InvoiceDraft).where(InvoiceDraft.journal_entry_id == journal_entry_id)
    )
    if draft is None:
        raise CorrectionNotFoundError("invoice draft not found for journal entry")
    if InvoiceKind(draft.invoice_kind) != InvoiceKind.DELIVERY_COMMISSION:
        raise CorrectionNotFoundError(
            "journal entry is not a delivery commission invoice"
        )
    return draft


def _release_posted_draft(draft: InvoiceDraft | None):
    """Hand back an `after_gl` hook that unposts the draft behind an entry.

    A voided invoice must not leave its draft reading `posted`. That status is
    what every screen goes by, so a stale one means the invoice still shows as
    booked, still offers Edit and Void, and still blocks the same file being
    uploaded again — while its money is no longer in the ledger. Pressing Void
    a second time then does nothing at all: the entry is already voided, so
    the actions endpoint returns no void path and the button quietly gives up.

    `confirmed` rather than `draft`: the invoice was read and approved, it is
    only the posting that was undone. It lands in Ready to post, which is
    where it can be posted again or discarded.

    Shared because supplier invoices, credit notes and delivery commissions
    all carry a draft, and the first version of this only did commissions —
    so voiding a supplier invoice left exactly the mess described above.
    """

    def release(sess: Session, _original: JournalEntry, _reversal: JournalEntry) -> None:
        if draft is None:
            return
        draft.status = InvoiceDraftStatus.CONFIRMED.value
        draft.posted_at = None
        draft.posted_by = None
        # `journal_entry_id` is deliberately kept. It is the only record that
        # this draft was ever in the books, and clearing it made a released
        # draft indistinguishable from one that was reviewed and never posted
        # — which broke re-uploading a voided invoice, the very complaint the
        # release was written for. Status is what every screen reads, and it
        # now says `confirmed`; the link is history, and history is the thing
        # you cannot reconstruct once it is gone.
        #
        # Safe because "posted" is decided by status everywhere that matters:
        # `find_live_posted_invoice` requires the draft to read
        # posted *and* the entry to be live, and no frontend screen infers
        # posting from this field.
        sess.flush()

    return release


def _draft_for_journal_entry(
    session: Session, journal_entry_id: uuid.UUID
) -> InvoiceDraft | None:
    """The draft behind a posted entry, if it came from one.

    None is ordinary: an invoice posted by hand has no uploaded document.
    """
    return session.scalar(
        select(InvoiceDraft).where(InvoiceDraft.journal_entry_id == journal_entry_id)
    )
