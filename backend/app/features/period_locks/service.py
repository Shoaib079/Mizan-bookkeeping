"""Period lock HTTP feature service — delegates to core/period_locks."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy.orm import Session

from sqlalchemy import select

from app.core.period_locks.models import PeriodLock, PeriodLockKind
from app.core.period_locks import year_end
from app.core.period_locks.service import close_period, list_period_locks, reopen_period
from app.db.session import entity_context, require_entity_context
from app.features.period_locks import readiness as readiness_module
from app.features.period_locks.schema import (
    MonthCloseReadinessOut,
    PeriodLockOut,
    ReadinessCheckOut,
    YearEndLineOut,
    YearEndPreviewOut,
)


class MonthNotReadyError(ValueError):
    """A blocking readiness check failed — the month isn't safe to close."""


class DecemberNotClosedError(ValueError):
    """Can't seal a year over a December that might still change."""


def _december_is_closed(session: Session, year: int) -> bool:
    return (
        session.scalar(
            select(PeriodLock).where(
                PeriodLock.lock_kind == PeriodLockKind.MONTH,
                PeriodLock.period_start == date(year, 12, 1),
                PeriodLock.reopened_at.is_(None),
            )
        )
        is not None
    )


def get_entity_year_end_preview(
    session: Session, entity_id: uuid.UUID, *, year: int
) -> YearEndPreviewOut:
    preview = year_end.preview_year_end_close(session, entity_id, year=year)

    with entity_context(session, entity_id):
        require_entity_context()
        december_closed = _december_is_closed(session, year)

    return YearEndPreviewOut(
        year=preview.year,
        closing_date=preview.closing_date,
        revenue_total_kurus=preview.revenue_total_kurus,
        expense_total_kurus=preview.expense_total_kurus,
        net_result_kurus=preview.net_result_kurus,
        lines=[YearEndLineOut.model_validate(line) for line in preview.lines],
        already_closed=preview.already_closed,
        journal_entry_id=preview.journal_entry_id,
        december_closed=december_closed,
        can_close=(
            december_closed and not preview.already_closed and bool(preview.lines)
        ),
    )


def close_entity_year(
    session: Session,
    entity_id: uuid.UUID,
    *,
    year: int,
    actor_id: uuid.UUID,
    description: str | None = None,
) -> YearEndPreviewOut:
    """Post the year-end entry, then return the year's new state."""
    with entity_context(session, entity_id):
        require_entity_context()
        if not _december_is_closed(session, year):
            raise DecemberNotClosedError(
                f"close December {year} before closing the year"
            )

    # The entry is dated 31 December, which sits inside a closed month — so it
    # needs the same unlock reason any owner write there would need. This one is
    # the system's own bookkeeping, not an amendment, so it explains itself.
    year_end.post_year_end_close(
        session,
        entity_id,
        year=year,
        actor_id=actor_id,
        description=description,
        period_unlock_reason=f"Year-end close {year}",
    )
    return get_entity_year_end_preview(session, entity_id, year=year)


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
