"""Cash drawer HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list

from app.config import settings
from app.core.cash.errors import DrawerDayClosedError, DrawerUnlockRequiredError
from app.core.cash.posting import InvalidCashDrawerError
from app.core.ledger.posting import InvalidAccountError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard, require_owner_members
from app.features.auth.models import User
from app.features.cash import service as cash_service
from app.features.cash.schema import (
    CashDrawerCloseDayRequest,
    CashDrawerCloseRequest,
    CashDrawerCloseResponse,
    CashDrawerReopenRequest,
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
    _: None = Depends(operations_write_guard),
) -> CashMovementRead:
    try:
        return cash_service.create_cash_movement(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (
        InvalidCashDrawerError,
        InvalidAccountError,
        DrawerDayClosedError,
        DrawerUnlockRequiredError,
    ) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@sessions_router.get("", response_model=PaginatedListOut[CashDrawerSessionRead])
def list_cash_drawer_sessions(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    money_account_id: uuid.UUID | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    status: str | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[CashDrawerSessionRead]:
    try:
        items, total = cash_service.list_cash_drawer_sessions(
            session,
            entity_id,
            money_account_id=money_account_id,
            from_date=from_date,
            to_date=to_date,
            status=status,
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


@sessions_router.get("/{session_id}", response_model=CashDrawerSessionDetail)
def get_cash_drawer_session(
    entity_id: uuid.UUID,
    session_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> CashDrawerSessionDetail:
    try:
        return cash_service.get_cash_drawer_session(session, entity_id, session_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@sessions_router.post("/close-day", response_model=CashDrawerCloseResponse)
def close_cash_drawer_day_route(
    entity_id: uuid.UUID,
    payload: CashDrawerCloseDayRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> CashDrawerCloseResponse:
    try:
        return cash_service.close_cash_drawer_day(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidCashDrawerError, DrawerDayClosedError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@sessions_router.post("/{session_id}/close", response_model=CashDrawerCloseResponse)
def close_cash_drawer_session_route(
    entity_id: uuid.UUID,
    session_id: uuid.UUID,
    payload: CashDrawerCloseRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
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


@sessions_router.post("/{session_id}/reopen", response_model=CashDrawerSessionRead)
def reopen_cash_drawer_session_route(
    entity_id: uuid.UUID,
    session_id: uuid.UUID,
    payload: CashDrawerReopenRequest,
    session: Session = Depends(get_session),
    owner: User | None = Depends(require_owner_members),
) -> CashDrawerSessionRead:
    if settings.auth_enforcement:
        if owner is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        actor_id = owner.id
    else:
        actor_id = payload.actor_id
    try:
        return cash_service.reopen_cash_drawer(
            session,
            entity_id,
            session_id,
            CashDrawerReopenRequest(
                reason=payload.reason,
                actor_id=actor_id,
            ),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (DrawerDayClosedError, DrawerUnlockRequiredError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
