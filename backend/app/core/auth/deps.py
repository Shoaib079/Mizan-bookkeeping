"""FastAPI auth dependencies — Clerk session JWT (Phase 8 launch)."""

from __future__ import annotations

import uuid

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.auth.clerk import ClerkTokenError, verify_clerk_token
from app.core.auth.permissions import Permission, user_has_permission
from app.core.auth.types import EntityRole
from app.db.session import entity_context, get_session
from app.features.auth import service as auth_service
from app.features.auth.audit import AuthAuditAction, record_auth_event
from app.features.auth.models import EntityMembership, User
from app.features.auth.service import AuthIdentityConflictError, UserNotProvisionedError


def _extract_bearer_token(authorization: str | None) -> str:
    if authorization is None or not authorization.strip():
        raise HTTPException(status_code=401, detail="Authorization Bearer token required")
    parts = authorization.strip().split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authorization Bearer token required")
    return parts[1]


def resolve_current_user(session: Session, authorization: str | None) -> User:
    """Resolve caller from verified Clerk session token."""
    token = _extract_bearer_token(authorization)
    try:
        claims = verify_clerk_token(token)
    except ClerkTokenError as exc:
        record_auth_event(
            session,
            AuthAuditAction.TOKEN_INVALID,
            detail=str(exc),
        )
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    try:
        user = auth_service.resolve_user_from_clerk(
            session,
            clerk_user_id=claims.clerk_user_id,
            email=claims.email,
            email_verified=claims.email_verified,
        )
    except UserNotProvisionedError as exc:
        record_auth_event(
            session,
            AuthAuditAction.LOGIN_DENIED,
            clerk_user_id=claims.clerk_user_id,
            email=claims.email,
            detail=str(exc),
        )
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except AuthIdentityConflictError as exc:
        record_auth_event(
            session,
            AuthAuditAction.LOGIN_DENIED,
            clerk_user_id=claims.clerk_user_id,
            email=claims.email,
            detail=str(exc),
        )
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    if not user.is_active:
        record_auth_event(
            session,
            AuthAuditAction.LOGIN_DENIED,
            user_id=user.id,
            clerk_user_id=claims.clerk_user_id,
            email=claims.email,
            detail="User is inactive",
        )
        raise HTTPException(status_code=403, detail="User is inactive")

    return user


def get_current_user(
    session: Session = Depends(get_session),
    authorization: str | None = Header(None),
) -> User:
    return resolve_current_user(session, authorization)


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
        record_auth_event(
            session,
            AuthAuditAction.PERMISSION_DENIED,
            user_id=user.id,
            entity_id=entity_id,
            detail="Not a member of this entity",
        )
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
        record_auth_event(
            session,
            AuthAuditAction.PERMISSION_DENIED,
            user_id=user.id,
            entity_id=entity_id,
            detail=f"Permission denied: {permission.value}",
        )
        raise HTTPException(
            status_code=403,
            detail=f"Permission denied: {permission.value}",
        )
    return membership


def financial_reports_guard(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    authorization: str | None = Header(None),
) -> None:
    if not settings.auth_enforcement:
        return
    user = resolve_current_user(session, authorization)
    require_permission(session, entity_id, user, Permission.FINANCIAL_REPORTS_READ)


def reports_read_guard(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    authorization: str | None = Header(None),
) -> None:
    if not settings.auth_enforcement:
        return
    user = resolve_current_user(session, authorization)
    require_permission(session, entity_id, user, Permission.REPORTS_READ)


def operations_write_guard(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    authorization: str | None = Header(None),
) -> None:
    if not settings.auth_enforcement:
        return
    user = resolve_current_user(session, authorization)
    require_permission(session, entity_id, user, Permission.OPERATIONS_WRITE)


def member_read_guard(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    authorization: str | None = Header(None),
) -> None:
    if not settings.auth_enforcement:
        return
    user = resolve_current_user(session, authorization)
    require_entity_membership(session, entity_id, user)


def require_authenticated_user(
    session: Session = Depends(get_session),
    authorization: str | None = Header(None),
) -> User | None:
    if not settings.auth_enforcement:
        return None
    return resolve_current_user(session, authorization)


def require_admin_members(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    authorization: str | None = Header(None),
) -> User | None:
    if not settings.auth_enforcement:
        return None
    user = resolve_current_user(session, authorization)
    require_permission(session, entity_id, user, Permission.ADMIN_MANAGE_MEMBERS)
    return user


def require_owner_members(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    authorization: str | None = Header(None),
) -> User | None:
    if not settings.auth_enforcement:
        return None
    user = resolve_current_user(session, authorization)
    membership = require_entity_membership(session, entity_id, user)
    if membership.entity_role != EntityRole.OWNER:
        record_auth_event(
            session,
            AuthAuditAction.PERMISSION_DENIED,
            user_id=user.id,
            entity_id=entity_id,
            detail="Owner role required",
        )
        raise HTTPException(status_code=403, detail="Owner role required")
    return user
