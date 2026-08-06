"""Entity HTTP routes — thin handlers only (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Header, Query, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.adapters.storage import load_upload_document, save_upload, upload_exists
from app.core.content_fingerprint import file_fingerprint
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
from app.features.auth.models import User
from app.features.entities import service
from app.features.entities.logo import InvalidLogoError, validate_logo
from app.features.entities.schema import (
    EntityCreate,
    EntityRead,
    EntitySettingCreate,
    EntitySettingRead,
    EntitySettingUpdate,
    EntityUpdate,
)

router = APIRouter(prefix="/entities", tags=["entities"])


@router.post("", response_model=EntityRead, status_code=201)
def create_entity(
    payload: EntityCreate,
    session: Session = Depends(get_session),
    user: User | None = Depends(require_authenticated_user),
) -> EntityRead:
    try:
        return service.create_entity(
            session,
            payload,
            creator_user_id=user.id if user is not None else None,
        )
    except service.DuplicateEntityNameError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
        [EntityRead.from_entity(e) for e in entities],
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
    return EntityRead.from_entity(entity)


@router.patch("/{entity_id}", response_model=EntityRead)
def update_entity(
    entity_id: uuid.UUID,
    payload: EntityUpdate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> EntityRead:
    if service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    # `exclude_unset`, not a list of field names: the old check named the three
    # fields that existed at the time, so slice 3's six new ones would have
    # been rejected as an empty payload with a message saying the opposite.
    if not payload.model_dump(exclude_unset=True):
        raise HTTPException(status_code=422, detail="At least one field is required")
    entity = service.update_entity(session, entity_id, payload)
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return EntityRead.from_entity(entity)


@router.put("/{entity_id}/logo", response_model=EntityRead)
async def upload_entity_logo(
    entity_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> EntityRead:
    """Replace this restaurant's logo.

    PUT rather than POST: there is one logo, and uploading a second one
    replaces the first rather than adding to a collection.
    """
    if service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    content = await file.read()
    try:
        fmt = validate_logo(content)
    except InvalidLogoError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    stored_path = save_upload(
        entity_id,
        file_fingerprint(content),
        content,
        extension=fmt.extension,
    )
    entity = service.set_entity_logo(
        session, entity_id, stored_path=stored_path, media_type=fmt.media_type
    )
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return EntityRead.from_entity(entity)


@router.get("/{entity_id}/logo", response_model=None)
def get_entity_logo(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
):
    entity = service.get_entity(session, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    stored = entity.logo_stored_path
    if not stored or not upload_exists(stored):
        raise HTTPException(status_code=404, detail="No logo uploaded")
    document = load_upload_document(
        stored, media_type=entity.logo_media_type or "image/png"
    )
    local_path, content, media_type = document.as_file_response_args()
    if local_path is not None:
        return FileResponse(local_path, media_type=media_type)
    assert content is not None
    return Response(content=content, media_type=media_type)


@router.delete("/{entity_id}/logo", response_model=EntityRead)
def delete_entity_logo(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> EntityRead:
    entity = service.clear_entity_logo(session, entity_id)
    if entity is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    return EntityRead.from_entity(entity)


@router.post("/{entity_id}/settings", response_model=EntitySettingRead, status_code=201)
def create_setting(
    entity_id: uuid.UUID,
    payload: EntitySettingCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> EntitySettingRead:
    if service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    try:
        return service.create_entity_setting(session, entity_id, payload)
    except service.DuplicateEntitySettingError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch(
    "/{entity_id}/settings/{key}",
    response_model=EntitySettingRead,
)
def update_setting(
    entity_id: uuid.UUID,
    key: str,
    payload: EntitySettingUpdate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> EntitySettingRead:
    if service.get_entity(session, entity_id) is None:
        raise HTTPException(status_code=404, detail="Entity not found")
    setting = service.update_entity_setting(session, entity_id, key, payload.value)
    if setting is None:
        raise HTTPException(status_code=404, detail="Setting not found")
    return EntitySettingRead.model_validate(setting)


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
