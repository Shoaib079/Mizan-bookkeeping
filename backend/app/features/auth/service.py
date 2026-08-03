"""Auth service — users and entity memberships."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.core.auth.clerk_invitations import (
    ClerkInviteError,
    ClerkInviteResult,
    create_clerk_invitation,
)
from app.core.auth.grants import (
    Grant,
    InvalidGrantsError,
    effective_grants,
    grants_for_role,
    grants_to_strings,
    validate_grants,
)
from app.core.auth.permissions import ROLE_PERMISSIONS
from app.core.auth.types import EntityRole
from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.db.session import entity_context
from app.features.auth.audit import AuthAuditAction, record_auth_event
from app.features.auth.models import EntityMembership, User
from app.features.auth.schema import (
    MembershipCreate,
    MembershipRead,
    MembershipUpdate,
    MyMembershipRead,
    UserCreate,
    UserRead,
    UserUpdate,
)
from app.features.entities import service as entity_service


class DuplicateUserError(Exception):
    """Raised when email already exists."""


class DuplicateMembershipError(Exception):
    """Raised when user is already a member of the entity."""

    def __init__(self, message: str = "Already a member of this restaurant.") -> None:
        super().__init__(message)


class CannotEditOwnerAccessError(Exception):
    """Raised when a PATCH tries to customize grants for an owner membership."""

    def __init__(
        self,
        message: str = "Owner access is fixed and cannot be edited.",
    ) -> None:
        super().__init__(message)


class LastOwnerError(Exception):
    """Raised when removing or demoting the last owner would lock the restaurant."""

    def __init__(
        self, message: str = "Cannot remove the last owner of this restaurant."
    ) -> None:
        super().__init__(message)


class CannotRemoveSelfError(Exception):
    """Raised when an owner tries to remove their own membership."""

    def __init__(
        self, message: str = "You cannot remove yourself from the team."
    ) -> None:
        super().__init__(message)


class UserNotProvisionedError(Exception):
    """Clerk identity has no matching local user and self-signup is disabled."""


class AuthIdentityConflictError(Exception):
    """Clerk identity does not match the linked local user."""


def resolve_user_from_clerk(
    session: Session, *, clerk_user_id: str, email: str, email_verified: bool
) -> User:
    """Resolve Clerk identity to a local user — link invited accounts or auto-provision."""
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
        if not settings.self_signup_enabled:
            raise UserNotProvisionedError(
                "No invited account for this email. Contact your administrator."
            )

        local_part = normalized_email.split("@", 1)[0]
        display_name = local_part or normalized_email
        new_user = User(
            email=normalized_email,
            display_name=display_name,
            external_auth_id=clerk_user_id,
            is_active=True,
        )
        session.add(new_user)
        try:
            session.commit()
            session.refresh(new_user)
        except IntegrityError:
            session.rollback()
            by_email = session.scalar(select(User).where(User.email == normalized_email))
            if by_email is None:
                by_email = session.scalar(
                    select(User).where(User.external_auth_id == clerk_user_id)
                )
            if by_email is None:
                raise
        else:
            record_auth_event(
                session,
                AuthAuditAction.LOGIN_SUCCESS,
                user_id=new_user.id,
                clerk_user_id=clerk_user_id,
                email=normalized_email,
                detail="Self-signup: new account auto-provisioned",
            )
            return new_user

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


def update_user_profile(
    session: Session, user: User, payload: UserUpdate
) -> User:
    user.display_name = payload.display_name.strip()
    session.commit()
    session.refresh(user)
    return user


def permissions_for_role(role: EntityRole, *, is_active: bool = True) -> list[str]:
    if not is_active:
        return []
    perms = ROLE_PERMISSIONS.get(role, frozenset())
    return sorted(p.value for p in perms)


def permissions_for_membership(membership: EntityMembership) -> list[str]:
    grants = effective_grants(
        membership.entity_role,
        membership.grants,
        is_active=membership.user.is_active,
    )
    api_values = {
        Grant.FINANCIAL_REPORTS_READ.value,
        Grant.OPERATIONS_WRITE.value,
        Grant.DAILY_TRANSACTIONS_WRITE.value,
        Grant.ADMIN_MANAGE_MEMBERS.value,
        Grant.REPORTS_READ.value,
    }
    return sorted(g.value for g in grants if g.value in api_values)


def grants_for_membership(membership: EntityMembership) -> list[str]:
    grants = effective_grants(
        membership.entity_role,
        membership.grants,
        is_active=membership.user.is_active,
    )
    return grants_to_strings(grants)


def get_user_membership(
    session: Session, entity_id: uuid.UUID, user_id: uuid.UUID
) -> EntityMembership | None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    with entity_context(session, entity_id):
        return session.scalar(
            select(EntityMembership)
            .options(joinedload(EntityMembership.user))
            .where(
                EntityMembership.entity_id == entity_id,
                EntityMembership.user_id == user_id,
            )
        )


def membership_to_read(membership: EntityMembership) -> MembershipRead:
    """Build API row — always resolve grants (NULL DB values fall back to role preset)."""
    return MembershipRead(
        id=membership.id,
        entity_id=membership.entity_id,
        user_id=membership.user_id,
        role=membership.entity_role,
        grants=grants_for_membership(membership),
        created_at=membership.created_at,
        user=UserRead.model_validate(membership.user),
    )


def build_my_membership_read(membership: EntityMembership) -> MyMembershipRead:
    role = membership.entity_role
    return MyMembershipRead(
        role=role,
        permissions=permissions_for_membership(membership),
        grants=grants_for_membership(membership),
    )


def list_entity_members(
    session: Session,
    entity_id: uuid.UUID,
    *,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[EntityMembership], int]:
    from app.features.auth.models import User

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    params = list_params or ListParams()
    with entity_context(session, entity_id):
        filters = []
        if q:
            search = text_search_filter(q, User.email, User.display_name)
            if search is not None:
                filters.append(search)
        stmt = (
            select(EntityMembership)
            .join(User, EntityMembership.user_id == User.id)
            .options(joinedload(EntityMembership.user))
            .where(EntityMembership.entity_id == entity_id, *filters)
            .order_by(EntityMembership.created_at)
        )
        return fetch_paginated(session, stmt, params)


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
            grants=grants_to_strings(grants_for_role(payload.role)),
        )
        session.add(membership)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise DuplicateMembershipError() from exc
        membership = session.scalar(
            select(EntityMembership)
            .options(joinedload(EntityMembership.user))
            .where(EntityMembership.id == membership.id)
        )
        assert membership is not None
        return membership


def invite_member_by_email(
    session: Session,
    entity_id: uuid.UUID,
    *,
    email: str,
    role: EntityRole,
    display_name: str | None = None,
    send_clerk_invite: bool = True,
) -> MembershipRead:
    """Create/find user, add membership, then email a Clerk sign-up invite."""
    normalized_email = email.strip().lower()
    user = session.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        name = (display_name or "").strip() or normalized_email
        user = create_user(
            session, UserCreate(email=normalized_email, display_name=name)
        )
    already_signed_up = bool(user.external_auth_id)
    membership = add_entity_member(
        session, entity_id, MembershipCreate(user_id=user.id, role=role)
    )

    if not send_clerk_invite:
        invite = ClerkInviteResult(outcome="skipped", detail="Invitation not requested")
    elif already_signed_up:
        invite = ClerkInviteResult(
            outcome="skipped",
            detail="Already signed up — they can sign in with this email",
        )
    else:
        try:
            invite = create_clerk_invitation(normalized_email)
        except ClerkInviteError as exc:
            invite = ClerkInviteResult(outcome="failed", detail=str(exc))

    # Snapshot before audit commit (expires ORM instances / RLS context).
    result = membership_to_read(membership).model_copy(
        update={
            "invite_sent": invite.sent,
            "invite_status": invite.outcome,
            "invite_detail": invite.detail,
        }
    )

    if invite.outcome in ("sent", "failed"):
        record_auth_event(
            session,
            AuthAuditAction.MEMBER_INVITED
            if invite.sent
            else AuthAuditAction.MEMBER_INVITE_FAILED,
            user_id=user.id,
            entity_id=entity_id,
            email=normalized_email,
            detail=invite.detail,
        )

    return result


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

        if membership.entity_role == EntityRole.OWNER and payload.grants is not None:
            raise CannotEditOwnerAccessError()

        next_role = membership.entity_role if payload.role is None else payload.role

        if payload.grants is not None:
            try:
                normalized = validate_grants(payload.grants, role=next_role)
            except InvalidGrantsError as exc:
                raise ValueError(str(exc)) from exc
            membership.grants = normalized

        if payload.role is not None:
            if (
                membership.entity_role == EntityRole.OWNER
                and payload.role != EntityRole.OWNER
            ):
                owners = session.scalars(
                    select(EntityMembership).where(
                        EntityMembership.entity_id == entity_id,
                        EntityMembership.role == EntityRole.OWNER.value,
                    )
                ).all()
                if len(owners) <= 1:
                    raise LastOwnerError("Cannot demote the last owner of this restaurant.")
            membership.role = payload.role.value
            if payload.grants is None:
                membership.grants = grants_to_strings(grants_for_role(payload.role))

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


def remove_entity_member(
    session: Session,
    entity_id: uuid.UUID,
    membership_id: uuid.UUID,
    *,
    actor_user_id: uuid.UUID | None,
) -> None:
    """Remove a user from this restaurant (membership only — not the global user)."""
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

        if membership.entity_role == EntityRole.OWNER:
            owners = session.scalars(
                select(EntityMembership).where(
                    EntityMembership.entity_id == entity_id,
                    EntityMembership.role == EntityRole.OWNER.value,
                )
            ).all()
            if len(owners) <= 1:
                raise LastOwnerError()

        if actor_user_id is not None and membership.user_id == actor_user_id:
            raise CannotRemoveSelfError()

        email = membership.user.email
        removed_user_id = membership.user_id
        session.delete(membership)
        session.commit()

    record_auth_event(
        session,
        AuthAuditAction.MEMBER_REMOVED,
        user_id=actor_user_id,
        entity_id=entity_id,
        email=email,
        detail=f"Removed membership for user {removed_user_id}",
    )
