"""Entity HTTP routes — thin handlers only (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.features.entities import service
from app.features.entities.schema import (
    EntityCreate,
    EntityRead,
    EntitySettingCreate,
    EntitySettingRead,
)

router = APIRouter(prefix="/entities", tags=["entities"])


@router.post("", response_model=EntityRead, status_code=201)
def create_entity(
    payload: EntityCreate, session: Session = Depends(get_session)
) -> EntityRead:
    return service.create_entity(session, payload)


@router.get("", response_model=list[EntityRead])
def list_entities(session: Session = Depends(get_session)) -> list[EntityRead]:
    return service.list_entities(session)


@router.get("/{entity_id}", response_model=EntityRead)
def get_entity(
    entity_id: uuid.UUID, session: Session = Depends(get_session)
) -> EntityRead:
    entity = service.get_entity(session, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return entity


@router.post("/{entity_id}/settings", response_model=EntitySettingRead, status_code=201)
def create_setting(
    entity_id: uuid.UUID,
    payload: EntitySettingCreate,
    session: Session = Depends(get_session),
) -> EntitySettingRead:
    if service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return service.create_entity_setting(session, entity_id, payload)


@router.get("/{entity_id}/settings", response_model=list[EntitySettingRead])
def list_settings(
    entity_id: uuid.UUID, session: Session = Depends(get_session)
) -> list[EntitySettingRead]:
    if service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return service.list_entity_settings(session, entity_id)
