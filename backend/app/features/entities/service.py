"""Entity registry and scoped settings — service layer (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.core.auth.types import EntityRole
from app.db.session import entity_context, require_entity_context, user_membership_lookup, user_membership_lookup
from app.features.auth.models import EntityMembership
from app.features.chart_of_accounts import service as chart_service
from app.features.entities.models import Entity, EntitySetting
from app.features.entities.schema import EntityCreate, EntitySettingCreate, EntityUpdate


class DuplicateEntitySettingError(ValueError):
    """Setting key already exists for this entity."""


class DuplicateEntityNameError(Exception):
    """User already owns a company with this name (case-insensitive)."""


def _user_owns_entity_named(
    session: Session, user_id: uuid.UUID, name: str
) -> bool:
    trimmed = name.strip()
    if not trimmed:
        return False
    with user_membership_lookup(session, user_id):
        existing_id = session.scalar(
            select(Entity.id)
            .join(EntityMembership, EntityMembership.entity_id == Entity.id)
            .where(
                EntityMembership.user_id == user_id,
                func.lower(Entity.name) == trimmed.lower(),
            )
            .limit(1)
        )
    return existing_id is not None


def create_entity(
    session: Session,
    payload: EntityCreate,
    *,
    creator_user_id: uuid.UUID | None = None,
) -> Entity:
    """Create entity; when creator_user_id is set, add owner membership atomically."""
    if creator_user_id is not None and _user_owns_entity_named(
        session, creator_user_id, payload.name
    ):
        raise DuplicateEntityNameError(
            "You already have a company with this name."
        )

    legal_name = (payload.legal_name or "").strip() or None
    entity = Entity(
        name=payload.name.strip(),
        legal_name=legal_name,
        vkn=payload.vkn,
    )
    session.add(entity)
    session.flush()

    if creator_user_id is not None:
        with entity_context(session, entity.id):
            session.add(
                EntityMembership(
                    entity_id=entity.id,
                    user_id=creator_user_id,
                    role=EntityRole.OWNER.value,
                )
            )
            session.flush()

    try:
        chart_service.provision_entity_baseline(session, entity.id, commit=False)
        session.commit()
    except Exception:
        session.rollback()
        raise
    session.refresh(entity)
    return entity


def list_entities(
    session: Session,
    *,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[Entity], int]:
    params = list_params or ListParams()
    filters = []
    search = text_search_filter(q, Entity.name)
    if search is not None:
        filters.append(search)
    stmt = select(Entity).where(*filters).order_by(Entity.name)
    return fetch_paginated(session, stmt, params)


def list_entities_for_user(
    session: Session,
    user_id: uuid.UUID,
    *,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[Entity], int]:
    params = list_params or ListParams()
    with user_membership_lookup(session, user_id):
        filters = []
        search = text_search_filter(q, Entity.name)
        if search is not None:
            filters.append(search)
        stmt = (
            select(Entity)
            .join(EntityMembership, EntityMembership.entity_id == Entity.id)
            .where(EntityMembership.user_id == user_id, *filters)
            .order_by(Entity.name)
        )
        return fetch_paginated(session, stmt, params)


def get_entity(session: Session, entity_id: uuid.UUID) -> Entity | None:
    return session.get(Entity, entity_id)


def update_entity(
    session: Session, entity_id: uuid.UUID, payload: EntityUpdate
) -> Entity | None:
    entity = get_entity(session, entity_id)
    if entity is None:
        return None

    if payload.name is not None:
        entity.name = payload.name.strip()
    if payload.legal_name is not None:
        entity.legal_name = payload.legal_name.strip() or None
    if payload.vkn is not None:
        entity.vkn = payload.vkn

    session.commit()
    session.refresh(entity)
    return entity


def create_entity_setting(
    session: Session, entity_id: uuid.UUID, payload: EntitySettingCreate
) -> EntitySetting:
    try:
        with entity_context(session, entity_id):
            setting = EntitySetting(key=payload.key, value=payload.value)
            session.add(setting)
            session.commit()
            session.refresh(setting)
            return setting
    except IntegrityError as exc:
        session.rollback()
        raise DuplicateEntitySettingError(
            f"Setting {payload.key!r} already exists for this entity"
        ) from exc


def update_entity_setting(
    session: Session, entity_id: uuid.UUID, key: str, value: str
) -> EntitySetting | None:
    with entity_context(session, entity_id):
        setting = session.scalar(select(EntitySetting).where(EntitySetting.key == key))
        if setting is None:
            return None
        setting.value = value
        session.commit()
        session.refresh(setting)
        return setting


def list_entity_settings(
    session: Session,
    entity_id: uuid.UUID,
    *,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[EntitySetting], int]:
    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        search = text_search_filter(q, EntitySetting.key)
        if search is not None:
            filters.append(search)
        stmt = select(EntitySetting).where(*filters).order_by(EntitySetting.key)
        return fetch_paginated(session, stmt, params)


def get_entity_setting_by_key(
    session: Session, entity_id: uuid.UUID, key: str
) -> EntitySetting | None:
    with entity_context(session, entity_id):
        return session.scalar(
            select(EntitySetting).where(EntitySetting.key == key)
        )
