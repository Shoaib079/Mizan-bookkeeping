"""Ledger HTTP routes — void only; create via manual-journals (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.ledger.models import JournalEntrySource, JournalEntryStatus
from app.core.ledger.posting import PostingError
from app.core.listing import ListParams, list_params_dependency, paginated_list
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.ledger import service
from app.features.ledger.schema import (
    CorrectJournalEntryOut,
    CorrectJournalEntryRequest,
    JournalEntryListOut,
    JournalEntryOut,
    VoidJournalEntryOut,
    VoidJournalEntryRequest,
)

router = APIRouter(prefix="/entities/{entity_id}/ledger", tags=["ledger"])


@router.get("/entries", response_model=JournalEntryListOut)
def list_journal_entries(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    status: JournalEntryStatus | None = Query(default=None),
    source: JournalEntrySource | None = Query(default=None),
    entry_date_from: date | None = Query(default=None, alias="from"),
    entry_date_to: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None),
    max_amount: int | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> JournalEntryListOut:
    try:
        items, total = service.list_journal_entries(
            session,
            entity_id,
            status=status,
            source=source,
            entry_date_from=entry_date_from,
            entry_date_to=entry_date_to,
            q=q,
            min_amount=min_amount,
            max_amount=max_amount,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        items,
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


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
