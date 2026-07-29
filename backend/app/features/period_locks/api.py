"""Period lock HTTP routes — close/reopen/list (Phase 8.5 Slice 4)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.period_locks.service import PeriodLockConflictError, PeriodLockNotFoundError
from app.core.auth.deps import member_read_guard, require_owner_members
from app.db.session import get_session
from app.features.auth.models import User
from app.features.period_locks import service
from app.core.period_locks import year_end
from app.features.period_locks.schema import (
    CloseYearRequest,
    ClosePeriodLockRequest,
    MonthCloseReadinessOut,
    PeriodLockListOut,
    PeriodLockOut,
    ReopenPeriodLockRequest,
    YearEndPreviewOut,
)

router = APIRouter(prefix="/entities/{entity_id}/period-locks", tags=["period-locks"])


@router.post("/close", response_model=PeriodLockOut, status_code=201)
def close_period_lock(
    entity_id: uuid.UUID,
    payload: ClosePeriodLockRequest,
    session: Session = Depends(get_session),
    owner: User | None = Depends(require_owner_members),
) -> PeriodLockOut:
    if owner is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        return service.close_entity_period(
            session,
            entity_id,
            lock_kind=payload.lock_kind,
            anchor_date=payload.anchor_date,
            actor_id=owner.id,
            reason=payload.reason,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.MonthNotReadyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PeriodLockConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/readiness", response_model=MonthCloseReadinessOut)
def month_close_readiness(
    entity_id: uuid.UUID,
    year: int,
    month: int,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> MonthCloseReadinessOut:
    try:
        return service.get_entity_month_close_readiness(
            session, entity_id, year=year, month=month
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/year-end", response_model=YearEndPreviewOut)
def year_end_preview(
    entity_id: uuid.UUID,
    year: int,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> YearEndPreviewOut:
    try:
        return service.get_entity_year_end_preview(session, entity_id, year=year)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/year-end", response_model=YearEndPreviewOut, status_code=201)
def close_year(
    entity_id: uuid.UUID,
    payload: CloseYearRequest,
    session: Session = Depends(get_session),
    owner: User | None = Depends(require_owner_members),
) -> YearEndPreviewOut:
    if owner is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        return service.close_entity_year(
            session,
            entity_id,
            year=payload.year,
            actor_id=owner.id,
            description=payload.description,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DecemberNotClosedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except year_end.AlreadyClosedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except year_end.NothingToCloseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/{lock_id}/reopen", response_model=PeriodLockOut)
def reopen_period_lock(
    entity_id: uuid.UUID,
    lock_id: uuid.UUID,
    payload: ReopenPeriodLockRequest,
    session: Session = Depends(get_session),
    owner: User | None = Depends(require_owner_members),
) -> PeriodLockOut:
    if owner is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        return service.reopen_entity_period(
            session,
            entity_id,
            lock_id,
            actor_id=owner.id,
            reason=payload.reason,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PeriodLockNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PeriodLockConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("", response_model=PeriodLockListOut)
def list_period_locks_route(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> PeriodLockListOut:
    try:
        items = service.list_entity_period_locks(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return PeriodLockListOut(items=items)
