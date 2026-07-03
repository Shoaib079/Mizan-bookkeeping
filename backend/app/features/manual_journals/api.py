"""Manual journal HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, list_params_dependency, paginated_list
from app.core.ledger.models import JournalEntryStatus
from app.core.ledger.posting import PostingError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard, resolve_actor_id
from app.features.auth.models import User
from app.features.manual_journals import service
from app.features.manual_journals.schema import (
    CreateManualJournalRequest,
    ManualJournalListOut,
    ManualJournalOut,
    ManualJournalVoidOut,
    VoidJournalEntryRequest,
)

router = APIRouter(prefix="/entities/{entity_id}/manual-journals", tags=["manual-journals"])


@router.post("", response_model=ManualJournalOut, status_code=201)
def create_manual_journal(
    entity_id: uuid.UUID,
    payload: CreateManualJournalRequest,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> ManualJournalOut:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.create_manual_journal(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("", response_model=ManualJournalListOut)
def list_manual_journals(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    status: JournalEntryStatus | None = None,
    entry_date_from: date | None = Query(default=None, alias="from"),
    entry_date_to: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None),
    max_amount: int | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> ManualJournalListOut:
    try:
        items, total = service.list_manual_journals(
            session,
            entity_id,
            status=status,
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


@router.get("/{entry_id}", response_model=ManualJournalOut)
def get_manual_journal(
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> ManualJournalOut:
    try:
        return service.get_manual_journal(session, entity_id, entry_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{entry_id}/void", response_model=ManualJournalVoidOut)
def void_manual_journal(
    entity_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: VoidJournalEntryRequest,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> ManualJournalVoidOut:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        original, reversal = service.void_manual_journal(
            session, entity_id, entry_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ManualJournalVoidOut(original=original, reversal=reversal)
