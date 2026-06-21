"""Cash drawer HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.cash.posting import InvalidCashDrawerError
from app.core.ledger.posting import InvalidAccountError
from app.db.session import get_session
from app.features.cash import service as cash_service
from app.features.cash.schema import (
    CashDrawerCloseRequest,
    CashDrawerCloseResponse,
    CashDrawerSessionDetail,
    CashDrawerSessionRead,
    CashMovementCreate,
    CashMovementRead,
)

movements_router = APIRouter(prefix="/entities/{entity_id}/cash/movements", tags=["cash"])
sessions_router = APIRouter(prefix="/entities/{entity_id}/cash/drawer-sessions", tags=["cash"])


@movements_router.post("", response_model=CashMovementRead, status_code=201)
def create_cash_movement(
    entity_id: uuid.UUID,
    payload: CashMovementCreate,
    session: Session = Depends(get_session),
) -> CashMovementRead:
    try:
        return cash_service.create_cash_movement(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidCashDrawerError, InvalidAccountError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@sessions_router.get("", response_model=list[CashDrawerSessionRead])
def list_cash_drawer_sessions(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    money_account_id: uuid.UUID | None = Query(default=None),
) -> list[CashDrawerSessionRead]:
    try:
        return cash_service.list_cash_drawer_sessions(
            session, entity_id, money_account_id=money_account_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@sessions_router.get("/{session_id}", response_model=CashDrawerSessionDetail)
def get_cash_drawer_session(
    entity_id: uuid.UUID,
    session_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> CashDrawerSessionDetail:
    try:
        return cash_service.get_cash_drawer_session(session, entity_id, session_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@sessions_router.post("/{session_id}/close", response_model=CashDrawerCloseResponse)
def close_cash_drawer_session_route(
    entity_id: uuid.UUID,
    session_id: uuid.UUID,
    payload: CashDrawerCloseRequest,
    session: Session = Depends(get_session),
) -> CashDrawerCloseResponse:
    try:
        return cash_service.close_cash_drawer(
            session,
            entity_id,
            session_id,
            counted_balance_kurus=payload.counted_balance_kurus,
            actor_id=payload.actor_id,
            description=payload.description,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidCashDrawerError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
