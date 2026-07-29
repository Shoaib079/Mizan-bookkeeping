"""Period lock HTTP feature service — delegates to core/period_locks."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from sqlalchemy import select

from app.core.period_locks.models import PeriodLock, PeriodLockKind
from app.core.period_locks.service import close_period, list_period_locks, reopen_period
from app.db.session import entity_context, require_entity_context
from app.features.period_locks import readiness as readiness_module
from app.features.period_locks.schema import (
    MonthCloseReadinessOut,
    PeriodLockOut,
    ReadinessCheckOut,
)


class MonthNotReadyError(ValueError):
    """A blocking readiness check failed — the month isn't safe to close."""


def get_entity_month_close_readiness(
    session: Session, entity_id: uuid.UUID, *, year: int, month: int
) -> MonthCloseReadinessOut:
    result = readiness_module.get_month_close_readiness(
        session, entity_id, year=year, month=month
    )

    with entity_context(session, entity_id):
        require_entity_context()
        lock = session.scalar(
            select(PeriodLock).where(
                PeriodLock.lock_kind == PeriodLockKind.MONTH,
                PeriodLock.period_start == result.period_start,
                PeriodLock.reopened_at.is_(None),
            )
        )
        existing = PeriodLockOut.model_validate(lock) if lock is not None else None

    return MonthCloseReadinessOut(
        year=result.year,
        month=result.month,
        period_start=result.period_start,
        period_end=result.period_end,
        checks=[ReadinessCheckOut.model_validate(c) for c in result.checks],
        can_close=result.can_close,
        warning_count=result.warning_count,
        existing_lock=existing,
    )


def close_entity_period(
    session: Session,
    entity_id: uuid.UUID,
    *,
    lock_kind: PeriodLockKind,
    anchor_date: date,
    actor_id: uuid.UUID,
    reason: str | None = None,
) -> PeriodLockOut:
    # Enforced here rather than in core.close_period: the readiness rules are a
    # month-end product decision, while core stays the generic lock primitive
    # that day-close and tests also use.
    if lock_kind == PeriodLockKind.MONTH:
        result = readiness_module.get_month_close_readiness(
            session, entity_id, year=anchor_date.year, month=anchor_date.month
        )
        failures = readiness_module.blocking_failures(result)
        if failures:
            raise MonthNotReadyError("; ".join(f.detail or f.label for f in failures))

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
