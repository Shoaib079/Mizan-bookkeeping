"""Period lock HTTP feature service — delegates to core/period_locks."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.core.period_locks.models import PeriodLockKind
from app.core.period_locks.service import close_period, list_period_locks, reopen_period
from app.features.period_locks.schema import PeriodLockOut


def close_entity_period(
    session: Session,
    entity_id: uuid.UUID,
    *,
    lock_kind: PeriodLockKind,
    anchor_date: date,
    actor_id: uuid.UUID,
    reason: str | None = None,
) -> PeriodLockOut:
    lock = close_period(
        session,
        entity_id,
        lock_kind=lock_kind,
        anchor_date=anchor_date,
        actor_id=actor_id,
        reason=reason,
    )
    return PeriodLockOut.model_validate(lock)


def reopen_entity_period(
    session: Session,
    entity_id: uuid.UUID,
    lock_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
) -> PeriodLockOut:
    lock = reopen_period(
        session,
        entity_id,
        lock_id,
        actor_id=actor_id,
        reason=reason,
    )
    return PeriodLockOut.model_validate(lock)


def list_entity_period_locks(session: Session, entity_id: uuid.UUID) -> list[PeriodLockOut]:
    locks = list_period_locks(session, entity_id)
    return [PeriodLockOut.model_validate(lock) for lock in locks]
