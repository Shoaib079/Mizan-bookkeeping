"""Entity HTTP routes — thin handlers only (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.config import settings
from app.core.auth.deps import (
    get_current_user,
    member_read_guard,
    operations_write_guard,
    require_authenticated_user,
    resolve_current_user,
)
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
    payload: EntityCreate,
    session: Session = Depends(get_session),
    _: object = Depends(require_authenticated_user),
) -> EntityRead:
    return service.create_entity(session, payload)


@router.get("", response_model=PaginatedListOut[EntityRead])
def list_entities(
    session: Session = Depends(get_session),
    authorization: str | None = Header(None),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[EntityRead]:
    if settings.auth_enforcement:
        user = resolve_current_user(session, authorization)
        entities, total = service.list_entities_for_user(
            session, user.id, q=q, list_params=list_params
        )
    else:
        entities, total = service.list_entities(session, q=q, list_params=list_params)
    return paginated_list(
        [EntityRead.model_validate(e) for e in entities],
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@router.get("/{entity_id}", response_model=EntityRead)
def get_entity(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
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
    _: None = Depends(operations_write_guard),
) -> EntitySettingRead:
    if service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return service.create_entity_setting(session, entity_id, payload)


@router.get("/{entity_id}/settings", response_model=PaginatedListOut[EntitySettingRead])
def list_settings(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[EntitySettingRead]:
    if service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    settings_rows, total = service.list_entity_settings(
        session, entity_id, q=q, list_params=list_params
    )
    return paginated_list(
        [EntitySettingRead.model_validate(s) for s in settings_rows],
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )
