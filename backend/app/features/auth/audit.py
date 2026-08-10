"""Append-only auth audit events (Phase 8 launch)."""

from __future__ import annotations

import enum
import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.features.auth.models import AuthAuditEvent


class AuthAuditAction(str, enum.Enum):
    LOGIN_SUCCESS = "login_success"
    LOGIN_DENIED = "login_denied"
    TOKEN_INVALID = "token_invalid"
    PERMISSION_DENIED = "permission_denied"
    MEMBER_INVITED = "member_invited"
    MEMBER_INVITE_FAILED = "member_invite_failed"
    MEMBER_REMOVED = "member_removed"
    #: Written before the restaurant is destroyed, and the only trace that
    #: survives it — every other record it had is entity-scoped and goes with
    #: it. This row detaches instead, via `ON DELETE SET NULL`.
    ENTITY_DELETED = "entity_deleted"


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
    def _build(scoped_to: uuid.UUID | None, note: str | None) -> AuthAuditEvent:
        return AuthAuditEvent(
            action=action.value,
            user_id=user_id,
            entity_id=scoped_to,
            clerk_user_id=clerk_user_id,
            email=email,
            detail=note,
        )

    try:
        with session.begin_nested():
            event = _build(entity_id, detail)
            session.add(event)
    except IntegrityError:
        # The restaurant in the request does not exist, so the foreign key
        # refuses the row.
        #
        # This is reached most often by the guard that denies access to a
        # restaurant you are not a member of — which is exactly the answer for
        # a restaurant that is gone. Letting the audit write fail turned a 403
        # into a 500, and did it for any unrecognised id in a URL, not only a
        # deleted one. The denial is the thing worth recording; what it was
        # aimed at is worth keeping too, so it moves into the note.
        note = f"{detail} (entity {entity_id}, no longer exists)" if detail else (
            f"entity {entity_id}, no longer exists"
        )
        with session.begin_nested():
            event = _build(None, note[:1024])
            session.add(event)

    session.commit()
    session.refresh(event)
    return event
