"""FastAPI auth dependencies — X-User-Id v1 transport (Phase 8)."""

from __future__ import annotations

import uuid

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.auth.permissions import Permission, user_has_permission
from app.db.session import entity_context, get_session
from app.features.auth.models import EntityMembership, User

X_USER_ID_HEADER = "X-User-Id"


def _parse_user_id(raw: str | None) -> uuid.UUID:
    if raw is None or not raw.strip():
        raise HTTPException(status_code=401, detail="X-User-Id header required")
    try:
        return uuid.UUID(raw.strip())
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid X-User-Id header") from exc


def get_current_user(
    session: Session = Depends(get_session),
    x_user_id: str | None = Header(None, alias=X_USER_ID_HEADER),
) -> User:
    """Resolve the caller from X-User-Id. Raises 401 when enforcement is on."""
    user_id = _parse_user_id(x_user_id)
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
    return user


def require_entity_membership(
    session: Session,
    entity_id: uuid.UUID,
    user: User,
) -> EntityMembership:
    with entity_context(session, entity_id):
        membership = session.scalar(
            select(EntityMembership)
            .options(joinedload(EntityMembership.user))
            .where(
                EntityMembership.entity_id == entity_id,
                EntityMembership.user_id == user.id,
            )
        )
    if membership is None:
        raise HTTPException(status_code=403, detail="Not a member of this entity")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")
    return membership


def require_permission(
    session: Session,
    entity_id: uuid.UUID,
    user: User,
    permission: Permission,
) -> EntityMembership:
    membership = require_entity_membership(session, entity_id, user)
    if not user_has_permission(
        membership.role, permission, is_active=membership.user.is_active
    ):
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied: {permission.value}",
        )
    return membership


def financial_reports_guard(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    x_user_id: str | None = Header(None, alias=X_USER_ID_HEADER),
) -> None:
    """Block cashier from P&L, balance sheet, cash flow, period comparison when enforced."""
    if not settings.auth_enforcement:
        return
    user = get_current_user(session=session, x_user_id=x_user_id)
    require_permission(session, entity_id, user, Permission.FINANCIAL_REPORTS_READ)


def require_admin_members(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    x_user_id: str | None = Header(None, alias=X_USER_ID_HEADER),
) -> User | None:
    """Guard membership admin routes when auth enforcement is enabled."""
    if not settings.auth_enforcement:
        return None
    user = get_current_user(session=session, x_user_id=x_user_id)
    require_permission(session, entity_id, user, Permission.ADMIN_MANAGE_MEMBERS)
    return user
