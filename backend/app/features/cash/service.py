"""Cash drawer service — movements and EOD close (Decisions §14)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.cash.posting import close_cash_drawer_session, post_cash_movement, reopen_cash_drawer_session
from app.core.listing import (
    ListParams,
    date_range_filters,
    fetch_paginated,
)
from app.db.session import entity_context, require_entity_context
from app.features.cash.models import CashDrawerSession, CashMovement
from app.features.cash.schema import (
    CashDrawerCloseDayRequest,
    CashDrawerCloseResponse,
    CashDrawerReopenRequest,
    CashDrawerSessionDetail,
    CashDrawerSessionRead,
    CashMovementCreate,
    CashMovementRead,
)
from app.features.entities import service as entity_service


def _to_movement_read(movement: CashMovement) -> CashMovementRead:
    return CashMovementRead(
        id=movement.id,
        entity_id=movement.entity_id,
        session_id=movement.session_id,
        money_account_id=movement.money_account_id,
        movement_date=movement.movement_date,
        direction=movement.direction,
        amount_kurus=movement.amount_kurus,
        offset_account_id=movement.offset_account_id,
        description=movement.description,
        actor_id=movement.actor_id,
        journal_entry_id=movement.journal_entry_id,
        created_at=movement.created_at,
    )


def _to_session_read(drawer_session: CashDrawerSession) -> CashDrawerSessionRead:
    return CashDrawerSessionRead(
        id=drawer_session.id,
        entity_id=drawer_session.entity_id,
        money_account_id=drawer_session.money_account_id,
        session_date=drawer_session.session_date,
        status=drawer_session.status,
        expected_balance_kurus=drawer_session.expected_balance_kurus,
        counted_balance_kurus=drawer_session.counted_balance_kurus,
        over_short_kurus=drawer_session.over_short_kurus,
        closed_at=drawer_session.closed_at,
        closed_by=drawer_session.closed_by,
        close_journal_entry_id=drawer_session.close_journal_entry_id,
        reopened_at=drawer_session.reopened_at,
        reopened_by=drawer_session.reopened_by,
        reopen_reason=drawer_session.reopen_reason,
        created_at=drawer_session.created_at,
    )


def create_cash_movement(
    session: Session,
    entity_id: uuid.UUID,
    payload: CashMovementCreate,
) -> CashMovementRead:
    result = post_cash_movement(
        session,
        entity_id,
        money_account_id=payload.money_account_id,
        movement_date=payload.movement_date,
        direction=payload.direction,
        amount_kurus=payload.amount_kurus,
        offset_account_id=payload.offset_account_id,
        description=payload.description,
        actor_id=payload.actor_id,
        period_unlock_reason=payload.period_unlock_reason,
    )
    return _to_movement_read(result.cash_movement)


def list_cash_drawer_sessions(
    session: Session,
    entity_id: uuid.UUID,
    *,
    money_account_id: uuid.UUID | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    status: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[CashDrawerSessionRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if money_account_id is not None:
            filters.append(CashDrawerSession.money_account_id == money_account_id)
        if status is not None:
            filters.append(CashDrawerSession.status == status)
        filters.extend(
            date_range_filters(
                CashDrawerSession.session_date, from_date=from_date, to_date=to_date
            )
        )
        stmt = (
            select(CashDrawerSession)
            .where(*filters)
            .order_by(
                CashDrawerSession.session_date.desc(),
                CashDrawerSession.created_at.desc(),
            )
        )
        sessions, total = fetch_paginated(session, stmt, params)
        return [_to_session_read(item) for item in sessions], total


def get_cash_drawer_session(
    session: Session,
    entity_id: uuid.UUID,
    session_id: uuid.UUID,
) -> CashDrawerSessionDetail:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        drawer_session = session.get(CashDrawerSession, session_id)
        if drawer_session is None:
            raise LookupError("Cash drawer session not found")

        movements = session.scalars(
            select(CashMovement)
            .where(CashMovement.session_id == session_id)
            .order_by(CashMovement.created_at.asc())
        ).all()

        return CashDrawerSessionDetail(
            **_to_session_read(drawer_session).model_dump(),
            movements=[_to_movement_read(movement) for movement in movements],
        )


def close_cash_drawer(
    session: Session,
    entity_id: uuid.UUID,
    session_id: uuid.UUID,
    *,
    counted_balance_kurus: int,
    actor_id: uuid.UUID,
    description: str = "Cash drawer EOD close",
) -> CashDrawerCloseResponse:
    result = close_cash_drawer_session(
        session,
        entity_id,
        session_id=session_id,
        counted_balance_kurus=counted_balance_kurus,
        actor_id=actor_id,
        description=description,
    )
    return CashDrawerCloseResponse(
        session=_to_session_read(result.session),
        close_journal_entry_id=(
            result.close_journal_entry.id if result.close_journal_entry is not None else None
        ),
    )


def close_cash_drawer_day(
    session: Session,
    entity_id: uuid.UUID,
    payload: CashDrawerCloseDayRequest,
) -> CashDrawerCloseResponse:
    result = close_cash_drawer_session(
        session,
        entity_id,
        money_account_id=payload.money_account_id,
        session_date=payload.session_date,
        counted_balance_kurus=payload.counted_balance_kurus,
        actor_id=payload.actor_id,
        description=payload.description,
    )
    return CashDrawerCloseResponse(
        session=_to_session_read(result.session),
        close_journal_entry_id=(
            result.close_journal_entry.id if result.close_journal_entry is not None else None
        ),
    )


def reopen_cash_drawer(
    session: Session,
    entity_id: uuid.UUID,
    session_id: uuid.UUID,
    payload: CashDrawerReopenRequest,
) -> CashDrawerSessionRead:
    drawer_session = reopen_cash_drawer_session(
        session,
        entity_id,
        session_id,
        actor_id=payload.actor_id,
        reason=payload.reason,
    )
    return _to_session_read(drawer_session)
