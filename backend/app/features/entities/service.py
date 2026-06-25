"""Entity registry and scoped settings — service layer (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.db.session import entity_context, require_entity_context, user_membership_lookup
from app.features.auth.models import EntityMembership
from app.features.entities.models import Entity, EntitySetting
from app.features.entities.schema import EntityCreate, EntitySettingCreate


class DuplicateEntitySettingError(ValueError):
    """Setting key already exists for this entity."""


def create_entity(session: Session, payload: EntityCreate) -> Entity:
    entity = Entity(name=payload.name)
    session.add(entity)
    session.commit()
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
