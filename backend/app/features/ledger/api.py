"""Ledger HTTP routes — void only; create via manual-journals (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.ledger.posting import PostingError
from app.db.session import get_session
from app.core.auth.deps import operations_write_guard
from app.features.ledger import service
from app.features.ledger.schema import (
    CorrectJournalEntryOut,
    CorrectJournalEntryRequest,
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
    _: None = Depends(operations_write_guard),
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


@router.post("/entries/{entry_id}/correct", response_model=CorrectJournalEntryOut)
def correct_entry(
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: CorrectJournalEntryRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> CorrectJournalEntryOut:
    try:
        original, reversal, corrected = service.correct_entry(
            session, entity_id, entry_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return CorrectJournalEntryOut(
        original=JournalEntryOut.model_validate(original),
        reversal=JournalEntryOut.model_validate(reversal),
        corrected=JournalEntryOut.model_validate(corrected),
    )
