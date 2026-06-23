"""Period lock close/reopen service (Phase 8.5 Slice 4)."""

from __future__ import annotations

import calendar
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.period_locks.models import (
    PeriodLock,
    PeriodLockAuditAction,
    PeriodLockAuditEvent,
    PeriodLockKind,
)
from app.db.base import utcnow
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service


class PeriodLockNotFoundError(LookupError):
    """Lock missing for this entity."""


class PeriodLockConflictError(ValueError):
    """Period already closed or invalid state."""


def _month_bounds(anchor: date) -> tuple[date, date]:
    last_day = calendar.monthrange(anchor.year, anchor.month)[1]
    return date(anchor.year, anchor.month, 1), date(anchor.year, anchor.month, last_day)


def _bounds_for_kind(lock_kind: PeriodLockKind, anchor: date) -> tuple[date, date]:
    if lock_kind == PeriodLockKind.DAY:
        return anchor, anchor
    return _month_bounds(anchor)


def _record_audit(
    session: Session,
    lock: PeriodLock,
    *,
    action: PeriodLockAuditAction,
    actor_id: uuid.UUID,
    reason: str | None = None,
    detail: str | None = None,
) -> PeriodLockAuditEvent:
    event = PeriodLockAuditEvent(
        period_lock_id=lock.id,
        action=action,
        actor_id=actor_id,
        reason=reason,
        detail=detail,
    )
    session.add(event)
    return event


def close_period(
    session: Session,
    entity_id: uuid.UUID,
    *,
    lock_kind: PeriodLockKind,
    anchor_date: date,
    actor_id: uuid.UUID,
    reason: str | None = None,
) -> PeriodLock:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    period_start, period_end = _bounds_for_kind(lock_kind, anchor_date)

    with entity_context(session, entity_id):
        require_entity_context()
        existing = session.scalar(
            select(PeriodLock).where(
                PeriodLock.lock_kind == lock_kind,
                PeriodLock.period_start == period_start,
            )
        )
        if existing is not None and existing.reopened_at is None:
            raise PeriodLockConflictError("period is already closed")

        if existing is not None:
            existing.reopened_at = None
            existing.reopened_by = None
            existing.closed_at = utcnow()
            existing.closed_by = actor_id
            existing.period_end = period_end
            existing.dirty = False
            lock = existing
        else:
            lock = PeriodLock(
                lock_kind=lock_kind,
                period_start=period_start,
                period_end=period_end,
                closed_by=actor_id,
            )
            session.add(lock)
            session.flush()

        _record_audit(
            session,
            lock,
            action=PeriodLockAuditAction.CLOSE,
            actor_id=actor_id,
            reason=reason,
            detail=f"{lock_kind.value}:{period_start.isoformat()}..{period_end.isoformat()}",
        )
        session.commit()
        session.refresh(lock)
        return lock


def reopen_period(
    session: Session,
    entity_id: uuid.UUID,
    lock_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
) -> PeriodLock:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()
        lock = session.get(PeriodLock, lock_id)
        if lock is None:
            raise PeriodLockNotFoundError("period lock not found")
        if lock.reopened_at is not None:
            raise PeriodLockConflictError("period is already reopened")

        lock.reopened_at = utcnow()
        lock.reopened_by = actor_id
        _record_audit(
            session,
            lock,
            action=PeriodLockAuditAction.REOPEN,
            actor_id=actor_id,
            reason=reason,
        )
        session.commit()
        session.refresh(lock)
        return lock


def list_period_locks(session: Session, entity_id: uuid.UUID) -> list[PeriodLock]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        return list(
            session.scalars(
                select(PeriodLock).order_by(
                    PeriodLock.period_start.desc(),
                    PeriodLock.closed_at.desc(),
                )
            )
        )
