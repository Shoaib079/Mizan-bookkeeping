"""Go-live floor and soft period lock guards — single posting boundary hook (Phase 8.5 Slice 4)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth.types import EntityRole
from app.core.period_locks.errors import (
    BeforeGoLiveError,
    PeriodLockedError,
    PeriodUnlockRequiredError,
)
from app.core.period_locks.models import (
    PeriodLock,
    PeriodLockAuditAction,
    PeriodLockAuditEvent,
)
from app.db.session import entity_context, get_current_entity_id, user_membership_lookup
from app.features.auth.models import EntityMembership
from app.features.entities.models import EntitySetting


def utc_today() -> date:
    """Default calendar date for entry_date when omitted — UTC, not local machine tz."""
    return datetime.now(timezone.utc).date()

def get_go_live_date(session: Session, entity_id: uuid.UUID) -> date | None:
    def _read() -> date | None:
        setting = session.scalar(
            select(EntitySetting).where(EntitySetting.key == "go_live_date")
        )
        if setting is None or not setting.value:
            return None
        return date.fromisoformat(setting.value)

    current = get_current_entity_id()
    if current == entity_id:
        return _read()
    with entity_context(session, entity_id):
        return _read()


def _is_owner(session: Session, entity_id: uuid.UUID, actor_id: uuid.UUID) -> bool:
    with user_membership_lookup(session, actor_id):
        membership = session.scalar(
            select(EntityMembership).where(
                EntityMembership.entity_id == entity_id,
                EntityMembership.user_id == actor_id,
            )
        )
    if membership is None:
        return False
    return EntityRole(membership.role) == EntityRole.OWNER


def _active_locks_for_dates(
    session: Session, entity_id: uuid.UUID, dates: list[date]
) -> list[PeriodLock]:
    if not dates:
        return []
    unique_dates = sorted(set(dates))
    min_d, max_d = unique_dates[0], unique_dates[-1]
    locks = list(
        session.scalars(
            select(PeriodLock).where(
                PeriodLock.entity_id == entity_id,
                PeriodLock.reopened_at.is_(None),
                PeriodLock.period_start <= max_d,
                PeriodLock.period_end >= min_d,
            )
        )
    )
    touched: list[PeriodLock] = []
    for lock in locks:
        for d in unique_dates:
            if lock.period_start <= d <= lock.period_end:
                touched.append(lock)
                break
    return touched


def _locks_with_close_history(
    session: Session, entity_id: uuid.UUID, dates: list[date]
) -> list[PeriodLock]:
    if not dates:
        return []
    unique_dates = sorted(set(dates))
    min_d, max_d = unique_dates[0], unique_dates[-1]
    locks = list(
        session.scalars(
            select(PeriodLock).where(
                PeriodLock.entity_id == entity_id,
                PeriodLock.period_start <= max_d,
                PeriodLock.period_end >= min_d,
            )
        )
    )
    touched: list[PeriodLock] = []
    for lock in locks:
        for d in unique_dates:
            if lock.period_start <= d <= lock.period_end:
                touched.append(lock)
                break
    return touched


def _record_unlock_write_audit(
    session: Session,
    lock: PeriodLock,
    *,
    actor_id: uuid.UUID,
    reason: str,
    detail: str | None = None,
) -> None:
    session.add(
        PeriodLockAuditEvent(
            period_lock_id=lock.id,
            action=PeriodLockAuditAction.UNLOCK_WRITE,
            actor_id=actor_id,
            reason=reason,
            detail=detail,
        )
    )


def mark_periods_dirty_for_dates(
    session: Session, entity_id: uuid.UUID, dates: list[date]
) -> None:
    for lock in _locks_with_close_history(session, entity_id, dates):
        lock.dirty = True


def assert_entry_dates_allowed(
    session: Session,
    entity_id: uuid.UUID,
    dates: list[date],
    *,
    actor_id: uuid.UUID,
    unlock_reason: str | None = None,
) -> None:
    """Reject go-live violations and soft-locked periods unless owner supplies unlock reason."""
    if not dates:
        return

    go_live = get_go_live_date(session, entity_id)
    if go_live is not None:
        for d in dates:
            if d < go_live:
                raise BeforeGoLiveError(
                    f"entry date {d.isoformat()} is before entity go-live {go_live.isoformat()}"
                )

    active_locks = _active_locks_for_dates(session, entity_id, dates)
    if not active_locks:
        return

    if not _is_owner(session, entity_id, actor_id):
        raise PeriodLockedError(
            "one or more dates fall in a closed period; owner unlock required"
        )

    reason = (unlock_reason or "").strip()
    if not reason:
        raise PeriodUnlockRequiredError(
            "period_unlock_reason is required for owner writes in a closed period"
        )

    for lock in active_locks:
        _record_unlock_write_audit(
            session,
            lock,
            actor_id=actor_id,
            reason=reason,
        )
        lock.dirty = True
