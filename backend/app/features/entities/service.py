"""Entity registry and scoped settings — service layer (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import entity_context, require_entity_context
from app.features.entities.models import Entity, EntitySetting
from app.features.entities.schema import EntityCreate, EntitySettingCreate


def create_entity(session: Session, payload: EntityCreate) -> Entity:
    entity = Entity(name=payload.name)
    session.add(entity)
    session.commit()
    session.refresh(entity)
    return entity


def list_entities(session: Session) -> list[Entity]:
    return list(session.scalars(select(Entity).order_by(Entity.name)))


def get_entity(session: Session, entity_id: uuid.UUID) -> Entity | None:
    return session.get(Entity, entity_id)


def create_entity_setting(
    session: Session, entity_id: uuid.UUID, payload: EntitySettingCreate
) -> EntitySetting:
    with entity_context(session, entity_id):
        setting = EntitySetting(key=payload.key, value=payload.value)
        session.add(setting)
        session.commit()
        session.refresh(setting)
        return setting


def list_entity_settings(session: Session, entity_id: uuid.UUID) -> list[EntitySetting]:
    with entity_context(session, entity_id):
        require_entity_context()
        return list(
            session.scalars(select(EntitySetting).order_by(EntitySetting.key))
        )


def get_entity_setting_by_key(
    session: Session, entity_id: uuid.UUID, key: str
) -> EntitySetting | None:
    with entity_context(session, entity_id):
        return session.scalar(
            select(EntitySetting).where(EntitySetting.key == key)
        )
