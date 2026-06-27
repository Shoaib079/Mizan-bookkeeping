"""Cash drawer day lock guards — mirror period-lock owner-unlock pattern (Phase 11 Slice 11.13)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.auth.types import EntityRole
from app.core.cash.errors import DrawerDayClosedError, DrawerUnlockRequiredError
from app.db.base import utcnow
from app.db.session import entity_context, require_entity_context, user_membership_lookup
from app.features.auth.models import EntityMembership
from app.features.cash.models import (
    CashDrawerAuditAction,
    CashDrawerAuditEvent,
    CashDrawerSession,
    CashDrawerSessionStatus,
    CashMovement,
)


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


def _get_drawer_session(
    session: Session,
    *,
    money_account_id: uuid.UUID,
    session_date: date,
) -> CashDrawerSession | None:
    return session.scalar(
        select(CashDrawerSession).where(
            CashDrawerSession.money_account_id == money_account_id,
            CashDrawerSession.session_date == session_date,
        )
    )


def _record_audit(
    session: Session,
    drawer_session: CashDrawerSession,
    *,
    action: CashDrawerAuditAction,
    actor_id: uuid.UUID,
    reason: str | None = None,
    detail: str | None = None,
) -> None:
    session.add(
        CashDrawerAuditEvent(
            cash_drawer_session_id=drawer_session.id,
            action=action,
            actor_id=actor_id,
            reason=reason,
            detail=detail,
        )
    )


def link_orphan_movements_to_session(
    session: Session,
    drawer_session: CashDrawerSession,
) -> int:
    """Attach session-less movements for this account/date to the drawer session."""
    result = session.execute(
        update(CashMovement)
        .where(
            CashMovement.session_id.is_(None),
            CashMovement.money_account_id == drawer_session.money_account_id,
            CashMovement.movement_date == drawer_session.session_date,
        )
        .values(session_id=drawer_session.id)
    )
    return int(result.rowcount or 0)


def ensure_open_drawer_session_for_close(
    session: Session,
    *,
    money_account_id: uuid.UUID,
    session_date: date,
) -> CashDrawerSession:
    """Create an OPEN session for EOD reconcile and link orphan movements."""
    drawer_session = _get_drawer_session(
        session,
        money_account_id=money_account_id,
        session_date=session_date,
    )
    if drawer_session is None:
        drawer_session = CashDrawerSession(
            money_account_id=money_account_id,
            session_date=session_date,
            status=CashDrawerSessionStatus.OPEN,
        )
        session.add(drawer_session)
        session.flush()
        session.refresh(drawer_session)
    elif drawer_session.status == CashDrawerSessionStatus.CLOSED:
        raise DrawerDayClosedError(
            "drawer day is closed; owner unlock required"
        )

    link_orphan_movements_to_session(session, drawer_session)
    return drawer_session


def reopen_cash_drawer_session(
    session: Session,
    entity_id: uuid.UUID,
    session_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str,
) -> CashDrawerSession:
    """Owner reopen of a closed drawer day — audited, status returns to OPEN."""
    if not _is_owner(session, entity_id, actor_id):
        raise DrawerDayClosedError("drawer day is closed; owner unlock required")

    trimmed = reason.strip()
    if not trimmed:
        raise DrawerUnlockRequiredError(
            "period_unlock_reason is required for owner writes in a closed drawer day"
        )

    with entity_context(session, entity_id):
        require_entity_context()
        drawer_session = session.get(CashDrawerSession, session_id)
        if drawer_session is None:
            raise LookupError("Cash drawer session not found")
        if drawer_session.status != CashDrawerSessionStatus.CLOSED:
            raise ValueError("drawer session is not closed")

        drawer_session.status = CashDrawerSessionStatus.OPEN
        drawer_session.reopened_at = utcnow()
        drawer_session.reopened_by = actor_id
        drawer_session.reopen_reason = trimmed
        _record_audit(
            session,
            drawer_session,
            action=CashDrawerAuditAction.REOPEN,
            actor_id=actor_id,
            reason=trimmed,
        )
        session.commit()
        session.refresh(drawer_session)
        return drawer_session


def assert_drawer_day_writable(
    session: Session,
    entity_id: uuid.UUID,
    *,
    money_account_id: uuid.UUID,
    session_date: date,
    actor_id: uuid.UUID,
    unlock_reason: str | None = None,
) -> CashDrawerSession | None:
    """Allow posts when no session or OPEN; block CLOSED unless owner unlocks."""
    drawer_session = _get_drawer_session(
        session,
        money_account_id=money_account_id,
        session_date=session_date,
    )
    if drawer_session is None or drawer_session.status == CashDrawerSessionStatus.OPEN:
        return drawer_session

    if not _is_owner(session, entity_id, actor_id):
        raise DrawerDayClosedError("drawer day is closed; owner unlock required")

    reason = (unlock_reason or "").strip()
    if not reason:
        raise DrawerUnlockRequiredError(
            "period_unlock_reason is required for owner writes in a closed drawer day"
        )

    drawer_session.status = CashDrawerSessionStatus.OPEN
    drawer_session.reopened_at = utcnow()
    drawer_session.reopened_by = actor_id
    drawer_session.reopen_reason = reason
    _record_audit(
        session,
        drawer_session,
        action=CashDrawerAuditAction.UNLOCK_WRITE,
        actor_id=actor_id,
        reason=reason,
    )
    session.flush()
    session.refresh(drawer_session)
    return drawer_session


def resolve_session_for_movement(
    session: Session,
    entity_id: uuid.UUID,
    *,
    money_account_id: uuid.UUID,
    session_date: date,
    actor_id: uuid.UUID,
    unlock_reason: str | None = None,
) -> uuid.UUID | None:
    """Return session_id to link (or None) — never auto-creates a session."""
    drawer_session = assert_drawer_day_writable(
        session,
        entity_id,
        money_account_id=money_account_id,
        session_date=session_date,
        actor_id=actor_id,
        unlock_reason=unlock_reason,
    )
    if drawer_session is None:
        return None
    return drawer_session.id
