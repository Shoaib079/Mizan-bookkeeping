"""Dish HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth.deps import member_read_guard, operations_write_guard
from app.core.listing import (
    ListParams,
    PaginatedListOut,
    list_params_dependency,
    paginated_list,
)
from app.db.session import get_session
from app.features.menu import service
from app.features.menu.schema import DishCreate, DishRead, DishUpdate
from app.features.menu.service import DuplicateDishError

router = APIRouter(prefix="/entities/{entity_id}/dishes", tags=["menu"])


@router.post("", response_model=DishRead, status_code=201)
def create_dish(
    entity_id: uuid.UUID,
    payload: DishCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> DishRead:
    try:
        dish = service.create_dish(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DuplicateDishError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return DishRead.model_validate(dish)


@router.get("", response_model=PaginatedListOut[DishRead])
def list_dishes(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[DishRead]:
    try:
        dishes, total = service.list_dishes(
            session,
            entity_id,
            include_inactive=include_inactive,
            q=q,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        [DishRead.model_validate(d) for d in dishes],
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@router.get("/{dish_id}", response_model=DishRead)
def get_dish(
    entity_id: uuid.UUID,
    dish_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> DishRead:
    try:
        dish = service.get_dish(session, entity_id, dish_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return DishRead.model_validate(dish)


@router.patch("/{dish_id}", response_model=DishRead)
def update_dish(
    entity_id: uuid.UUID,
    dish_id: uuid.UUID,
    payload: DishUpdate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> DishRead:
    try:
        dish = service.update_dish(session, entity_id, dish_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DuplicateDishError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return DishRead.model_validate(dish)
