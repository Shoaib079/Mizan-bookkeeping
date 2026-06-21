"""Ledger feature service — void delegates to core/ledger posting boundary."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import void_journal_entry
from app.features.entities import service as entity_service
from app.features.ledger.schema import VoidJournalEntryRequest


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
