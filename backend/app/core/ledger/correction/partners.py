"""Correcting and voiding a partner's ledger movements.

Lifted verbatim from `correction.py` when it was split.

What may be corrected here is decided by journal source, not by the row's
movement type. A personal expense split writes a `drawing` under source
`expense_personal_split` and a partner-paid supplier invoice writes an
`expense_fronted` under `partner_supplier_paid`; both have a second leg this
route knows nothing about, and rebuilding from the movement type alone turned
a split into half a split. The guard lives in `features/partners/service.py`
and reads the capability table rather than a list of its own.
"""

from __future__ import annotations

from app.core.ledger.correction.machinery import SubledgerCorrectionResult, SubledgerVoidResult, correct_gl_with_subledger_rows, void_gl_with_subledger_rows
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import PostingLine
from app.core.partners import ledger as partner_ledger
from app.core.partners.models import PartnerLedgerEntry
from app.core.payables.models import SupplierLedgerEntry
from app.db.session import entity_context, require_entity_context
from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session
import uuid


def correct_partner_journal_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    entry_date: date,
    description: str,
    lines: list[PostingLine],
    *,
    actor_id: uuid.UUID,
    amount_kurus: int | None = None,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    with entity_context(session, entity_id):
        require_entity_context()
        partner_row = session.scalar(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if partner_row is None:
            raise CorrectionNotFoundError("partner ledger entry not found for journal entry")

        partner_id = partner_row.partner_id
        movement_type = partner_row.movement_type
        new_amount_kurus = amount_kurus if amount_kurus is not None else partner_row.amount_kurus

        def new_row(sess: Session, corrected: JournalEntry) -> None:
            partner_ledger.persist_partner_ledger_entry(
                sess,
                partner_id,
                movement_date=entry_date,
                movement_type=movement_type,
                amount_kurus=new_amount_kurus,
                description=description,
                actor_id=actor_id,
                journal_entry_id=corrected.id,
                reference_type=partner_row.reference_type,
                reference_id=partner_row.reference_id,
            )

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        entry_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        partner_row=partner_row,
        new_partner_row=new_row,
    )


def void_partner_journal_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    with entity_context(session, entity_id):
        require_entity_context()
        partner_row = session.scalar(
            select(PartnerLedgerEntry).where(
                PartnerLedgerEntry.journal_entry_id == journal_entry_id
            )
        )
        if partner_row is None:
            raise CorrectionNotFoundError("partner ledger entry not found for journal entry")
        # Partner paid supplier (split buy) also clears AP — reverse both ledgers.
        supplier_row = session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.journal_entry_id == journal_entry_id
            )
        )

    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        partner_row=partner_row,
        supplier_row=supplier_row,
    )
