"""Dish service (ARCHITECTURE.md — thin routes, logic here)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.menu.models import Dish, SUITABILITY_FIELDS
from app.features.menu.schema import DishCreate, DishUpdate


class DuplicateDishError(ValueError):
    """A dish with this name already exists for this restaurant."""


def create_dish(session: Session, entity_id: uuid.UUID, payload: DishCreate) -> Dish:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        dish = Dish(
            name=payload.name,
            description=payload.description,
            description_tr=payload.description_tr,
            suits_veg=payload.suits_veg,
            suits_non_veg=payload.suits_non_veg,
            suits_jain=payload.suits_jain,
        )
        session.add(dish)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            # The unique constraint doing its job. Reported rather than
            # swallowed: a second "Dal Tadka" means one of the two is about to
            # be picked by mistake on a menu.
            raise DuplicateDishError(
                f"A dish named {payload.name!r} already exists"
            ) from exc
        session.refresh(dish)
        return dish


def list_dishes(
    session: Session,
    entity_id: uuid.UUID,
    *,
    include_inactive: bool = False,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[Dish], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if not include_inactive:
            filters.append(Dish.is_active.is_(True))
        search = text_search_filter(q, Dish.name, Dish.description)
        if search is not None:
            filters.append(search)
        stmt = select(Dish).where(*filters).order_by(Dish.name)
        return fetch_paginated(session, stmt, params)


def get_dish(session: Session, entity_id: uuid.UUID, dish_id: uuid.UUID) -> Dish:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        dish = session.get(Dish, dish_id)
        if dish is None:
            raise LookupError("Dish not found")
        return dish


def update_dish(
    session: Session,
    entity_id: uuid.UUID,
    dish_id: uuid.UUID,
    payload: DishUpdate,
) -> Dish:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        dish = session.get(Dish, dish_id)
        if dish is None:
            raise LookupError("Dish not found")

        if payload.name is not None:
            dish.name = payload.name
        # `description` is clearable: sending null means "remove it", which a
        # plain `is not None` check would silently ignore. That is why the
        # update is checked against the fields actually sent.
        fields_sent = payload.model_fields_set
        for field in ("description", "description_tr"):
            if field in fields_sent:
                setattr(dish, field, getattr(payload, field))
        for field in SUITABILITY_FIELDS:
            value = getattr(payload, field)
            if value is not None:
                setattr(dish, field, value)
        if payload.is_active is not None:
            dish.is_active = payload.is_active

        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise DuplicateDishError(
                f"A dish named {payload.name!r} already exists"
            ) from exc
        session.refresh(dish)
        return dish


@dataclass(frozen=True)
class DishCopyResult:
    copied: int
    skipped: list[str]


def copy_dishes_between_entities(
    session: Session,
    target_entity_id: uuid.UUID,
    source_entity_id: uuid.UUID,
) -> DishCopyResult:
    """Seed one restaurant's dish list from another's.

    **The only place menu data crosses restaurants**, and it does so as a copy:
    the rows are new, belong to the target, and diverge from that moment. The
    caller is responsible for proving the user may read the source — the route
    does that explicitly, because row-level security protects a *session*, not
    a function, and this function deliberately opens two.

    Names already present in the target are skipped rather than overwritten. A
    restaurant that has started editing its own "Dal Tadka" should not have it
    replaced by another restaurant's wording — the whole reason these lists are
    separate.
    """
    if target_entity_id == source_entity_id:
        raise ValueError("source and target are the same restaurant")
    for candidate in (target_entity_id, source_entity_id):
        if entity_service.get_entity(session, candidate) is None:
            raise LookupError("Entity not found")

    with entity_context(session, source_entity_id):
        require_entity_context()
        source_dishes = list(
            session.scalars(
                select(Dish).where(Dish.is_active.is_(True)).order_by(Dish.name)
            ).all()
        )
        # Read the values out while the source context is open: the objects
        # expire on commit below, and reloading them under the *target*
        # context would find nothing.
        payloads = [
            {
                "name": dish.name,
                "description": dish.description,
                "description_tr": dish.description_tr,
                "suits_veg": dish.suits_veg,
                "suits_non_veg": dish.suits_non_veg,
                "suits_jain": dish.suits_jain,
            }
            for dish in source_dishes
        ]

    with entity_context(session, target_entity_id):
        require_entity_context()
        existing = {
            name.casefold()
            for name in session.scalars(select(Dish.name)).all()
        }
        skipped: list[str] = []
        copied = 0
        for payload in payloads:
            if payload["name"].casefold() in existing:
                skipped.append(payload["name"])
                continue
            session.add(Dish(**payload))
            copied += 1
        session.commit()

    return DishCopyResult(copied=copied, skipped=skipped)
