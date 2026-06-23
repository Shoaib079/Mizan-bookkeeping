"""Ledger feature service — void/correct delegate to core/ledger posting boundary."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import PostingLine, correct_journal_entry, void_journal_entry
from app.features.entities import service as entity_service
from app.features.ledger.schema import CorrectJournalEntryRequest, VoidJournalEntryRequest


def void_entry(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: VoidJournalEntryRequest,
) -> tuple[JournalEntry, JournalEntry]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    return void_journal_entry(
        session,
        entity_id,
        entry_id,
        actor_id=payload.actor_id,
        reason=payload.reason,
        void_date=payload.void_date,
    )


def correct_entry(
    session: Session,
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: CorrectJournalEntryRequest,
) -> tuple[JournalEntry, JournalEntry, JournalEntry]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    lines = [
        PostingLine(
            account_id=line.account_id,
            amount_kurus=line.amount_kurus,
            side=line.side,
        )
        for line in payload.lines
    ]
    return correct_journal_entry(
        session,
        entity_id,
        entry_id,
        payload.entry_date,
        payload.description,
        lines,
        actor_id=payload.actor_id,
        reason=payload.reason,
        void_date=payload.void_date,
    )
