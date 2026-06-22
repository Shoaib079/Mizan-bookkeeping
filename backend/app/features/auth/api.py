"""Auth HTTP routes — users and entity memberships (Phase 8)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth.deps import require_admin_members
from app.db.session import get_session
from app.features.auth import service
from app.features.auth.schema import (
    MembershipCreate,
    MembershipRead,
    MembershipUpdate,
    UserCreate,
    UserRead,
)

users_router = APIRouter(prefix="/users", tags=["auth"])
members_router = APIRouter(prefix="/entities/{entity_id}/members", tags=["auth"])


@users_router.post("", response_model=UserRead, status_code=201)
def create_user(
    payload: UserCreate, session: Session = Depends(get_session)
) -> UserRead:
    try:
        user = service.create_user(session, payload)
    except service.DuplicateUserError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return UserRead.model_validate(user)


@users_router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: uuid.UUID, session: Session = Depends(get_session)
) -> UserRead:
    user = service.get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserRead.model_validate(user)


@members_router.get("", response_model=list[MembershipRead])
def list_members(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin_members),
) -> list[MembershipRead]:
    try:
        memberships = service.list_entity_members(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return [MembershipRead.model_validate(m) for m in memberships]


@members_router.post("", response_model=MembershipRead, status_code=201)
def add_member(
    entity_id: uuid.UUID,
    payload: MembershipCreate,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin_members),
) -> MembershipRead:
    try:
        membership = service.add_entity_member(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DuplicateMembershipError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return MembershipRead.model_validate(membership)


@members_router.patch("/{membership_id}", response_model=MembershipRead)
def update_member(
    entity_id: uuid.UUID,
    membership_id: uuid.UUID,
    payload: MembershipUpdate,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin_members),
) -> MembershipRead:
    try:
        membership = service.update_entity_member(
            session, entity_id, membership_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return MembershipRead.model_validate(membership)
