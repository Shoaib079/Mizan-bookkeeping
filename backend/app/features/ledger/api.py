"""Ledger HTTP routes — void only; create via manual-journals (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.ledger.posting import PostingError
from app.db.session import get_session
from app.features.ledger import service
from app.features.ledger.schema import (
    JournalEntryOut,
    VoidJournalEntryOut,
    VoidJournalEntryRequest,
)

router = APIRouter(prefix="/entities/{entity_id}/ledger", tags=["ledger"])


@router.post("/entries/{entry_id}/void", response_model=VoidJournalEntryOut)
def void_entry(
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: VoidJournalEntryRequest,
    session: Session = Depends(get_session),
) -> VoidJournalEntryOut:
    try:
        original, reversal = service.void_entry(session, entity_id, entry_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return VoidJournalEntryOut(
        original=JournalEntryOut.model_validate(original),
        reversal=JournalEntryOut.model_validate(reversal),
    )
