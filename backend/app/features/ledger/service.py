"""Ledger feature service — delegates to core/ledger posting boundary."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import PostingLine, post_journal_entry
from app.features.entities import service as entity_service
from app.features.ledger.schema import PostJournalEntryRequest


def create_journal_entry(
    session: Session, entity_id: uuid.UUID, payload: PostJournalEntryRequest
) -> JournalEntry:
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
    return post_journal_entry(
        session,
        entity_id,
        payload.entry_date,
        payload.description,
        lines,
    )
