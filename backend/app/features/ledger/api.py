"""Ledger HTTP routes — thin handlers; all posts via core/ledger (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.ledger.posting import PostingError
from app.db.session import get_session
from app.features.ledger import service
from app.features.ledger.schema import JournalEntryOut, PostJournalEntryRequest

router = APIRouter(prefix="/entities/{entity_id}/ledger", tags=["ledger"])


@router.post("/entries", response_model=JournalEntryOut, status_code=201)
def post_entry(
    entity_id: uuid.UUID,
    payload: PostJournalEntryRequest,
    session: Session = Depends(get_session),
) -> JournalEntryOut:
    try:
        entry = service.create_journal_entry(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return JournalEntryOut.model_validate(entry)
