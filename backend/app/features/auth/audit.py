"""Append-only auth audit events (Phase 8 launch)."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy.orm import Session

from app.features.auth.models import AuthAuditEvent


class AuthAuditAction(str, enum.Enum):
    LOGIN_SUCCESS = "login_success"
    LOGIN_DENIED = "login_denied"
    TOKEN_INVALID = "token_invalid"
    PERMISSION_DENIED = "permission_denied"


def record_auth_event(
    session: Session,
    action: AuthAuditAction,
    *,
    user_id: uuid.UUID | None = None,
    entity_id: uuid.UUID | None = None,
    clerk_user_id: str | None = None,
    email: str | None = None,
    detail: str | None = None,
) -> AuthAuditEvent:
    event = AuthAuditEvent(
        action=action.value,
        user_id=user_id,
        entity_id=entity_id,
        clerk_user_id=clerk_user_id,
        email=email,
        detail=detail,
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    return event
