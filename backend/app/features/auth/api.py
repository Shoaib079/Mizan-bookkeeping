"""Auth HTTP routes — users and entity memberships (Phase 8)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.config import settings
from app.core.auth.deps import require_admin_members, resolve_current_user
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


@users_router.get("/me", response_model=UserRead)
def get_current_user_profile(
    session: Session = Depends(get_session),
    authorization: str | None = Header(None),
) -> UserRead:
    """Return the provisioned local user for the verified Clerk session."""
    if not settings.auth_enforcement:
        raise HTTPException(status_code=404, detail="Auth enforcement is disabled")
    user = resolve_current_user(session, authorization)
    return UserRead.model_validate(user)


@users_router.get("/{user_id}", response_model=UserRead)
def get_user(
    user_id: uuid.UUID, session: Session = Depends(get_session)
) -> UserRead:
    user = service.get_user(session, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return UserRead.model_validate(user)


@members_router.get("", response_model=PaginatedListOut[MembershipRead])
def list_members(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: object = Depends(require_admin_members),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[MembershipRead]:
    try:
        memberships, total = service.list_entity_members(
            session, entity_id, q=q, list_params=list_params
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        [MembershipRead.model_validate(m) for m in memberships],
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


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
