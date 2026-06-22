"""Auth service — users and entity memberships."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.db.session import entity_context
from app.features.auth.models import EntityMembership, User
from app.features.auth.schema import MembershipCreate, MembershipUpdate, UserCreate
from app.features.entities import service as entity_service


class DuplicateUserError(Exception):
    """Raised when email already exists."""


class DuplicateMembershipError(Exception):
    """Raised when user is already a member of the entity."""


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
