"""Auth service — users and entity memberships."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.db.session import entity_context
from app.features.auth.audit import AuthAuditAction, record_auth_event
from app.features.auth.models import EntityMembership, User
from app.features.auth.schema import MembershipCreate, MembershipUpdate, UserCreate
from app.features.entities import service as entity_service


class DuplicateUserError(Exception):
    """Raised when email already exists."""


class DuplicateMembershipError(Exception):
    """Raised when user is already a member of the entity."""


class UserNotProvisionedError(Exception):
    """Clerk identity has no matching invited local user."""


class AuthIdentityConflictError(Exception):
    """Clerk identity does not match the linked local user."""


def resolve_user_from_clerk(
    session: Session, *, clerk_user_id: str, email: str, email_verified: bool
) -> User:
    """Invite-only: link Clerk id to pre-provisioned local user by verified email."""
    if not email_verified:
        raise UserNotProvisionedError("Email address is not verified")

    normalized_email = email.strip().lower()
    by_clerk = session.scalar(
        select(User).where(User.external_auth_id == clerk_user_id)
    )
    if by_clerk is not None:
        if by_clerk.email != normalized_email:
            raise AuthIdentityConflictError("Clerk identity email mismatch")
        return by_clerk

    by_email = session.scalar(select(User).where(User.email == normalized_email))
    if by_email is None:
        raise UserNotProvisionedError(
            "No invited account for this email. Contact your administrator."
        )

    if by_email.external_auth_id and by_email.external_auth_id != clerk_user_id:
        raise AuthIdentityConflictError("Email already linked to a different sign-in identity")

    if by_email.external_auth_id != clerk_user_id:
        by_email.external_auth_id = clerk_user_id
        session.commit()
        session.refresh(by_email)
        record_auth_event(
            session,
            AuthAuditAction.LOGIN_SUCCESS,
            user_id=by_email.id,
            clerk_user_id=clerk_user_id,
            email=normalized_email,
            detail="First Clerk sign-in linked to invited account",
        )

    return by_email


def create_user(session: Session, payload: UserCreate) -> User:
    user = User(email=payload.email.lower(), display_name=payload.display_name)
    session.add(user)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise DuplicateUserError(f"User with email {payload.email} already exists") from exc
    session.refresh(user)
    return user


def get_user(session: Session, user_id: uuid.UUID) -> User | None:
    return session.get(User, user_id)


def list_entity_members(
    session: Session, entity_id: uuid.UUID
) -> list[EntityMembership]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    with entity_context(session, entity_id):
        return list(
            session.scalars(
                select(EntityMembership)
                .options(joinedload(EntityMembership.user))
                .order_by(EntityMembership.created_at)
            )
        )


def add_entity_member(
    session: Session, entity_id: uuid.UUID, payload: MembershipCreate
) -> EntityMembership:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    user = session.get(User, payload.user_id)
    if user is None:
        raise LookupError("User not found")

    with entity_context(session, entity_id):
        membership = EntityMembership(
            entity_id=entity_id,
            user_id=payload.user_id,
            role=payload.role.value,
        )
        session.add(membership)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise DuplicateMembershipError(
                "User is already a member of this entity"
            ) from exc
        membership = session.scalar(
            select(EntityMembership)
            .options(joinedload(EntityMembership.user))
            .where(EntityMembership.id == membership.id)
        )
        assert membership is not None
        return membership


def update_entity_member(
    session: Session,
    entity_id: uuid.UUID,
    membership_id: uuid.UUID,
    payload: MembershipUpdate,
) -> EntityMembership:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        membership = session.scalar(
            select(EntityMembership)
            .options(joinedload(EntityMembership.user))
            .where(
                EntityMembership.id == membership_id,
                EntityMembership.entity_id == entity_id,
            )
        )
        if membership is None:
            raise LookupError("Membership not found")

        if payload.role is not None:
            membership.role = payload.role.value
        if payload.is_active is not None:
            membership.user.is_active = payload.is_active

        session.commit()
        membership = session.scalar(
            select(EntityMembership)
            .options(joinedload(EntityMembership.user))
            .where(EntityMembership.id == membership.id)
        )
        assert membership is not None
        return membership
