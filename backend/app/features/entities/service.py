"""Entity registry and scoped settings — service layer (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.adapters.storage import delete_stored_upload
from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.core.auth.types import EntityRole
from app.db.session import entity_context, require_entity_context, user_membership_lookup
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


#: Fields where an empty string means "clear this", and null means "leave it".
#: `name` is not among them — a restaurant without a name is not a state the
#: rest of the app can render.
_OPTIONAL_TEXT_FIELDS = (
    "legal_name",
    "address",
    "phone_primary",
    "phone_secondary",
    "email",
    "menu_terms",
    "menu_validity_note",
)


def update_entity(
    session: Session, entity_id: uuid.UUID, payload: EntityUpdate
) -> Entity | None:
    entity = get_entity(session, entity_id)
    if entity is None:
        return None

    if payload.name is not None:
        entity.name = payload.name.strip()
    if payload.vkn is not None:
        entity.vkn = payload.vkn
    for field in _OPTIONAL_TEXT_FIELDS:
        value = getattr(payload, field)
        if value is not None:
            setattr(entity, field, value.strip() or None)

    session.commit()
    session.refresh(entity)
    return entity


def set_entity_logo(
    session: Session,
    entity_id: uuid.UUID,
    *,
    stored_path: str,
    media_type: str,
) -> Entity | None:
    """Point the restaurant at a newly stored logo, discarding the old file.

    The previous file is deleted *after* the row is committed. The other order
    — delete then save — leaves the restaurant with a path to nothing if the
    commit fails, and a missing logo is harder to notice than an orphaned one.
    """
    entity = get_entity(session, entity_id)
    if entity is None:
        return None
    previous = entity.logo_stored_path
    entity.logo_stored_path = stored_path
    entity.logo_media_type = media_type
    session.commit()
    session.refresh(entity)
    if previous and previous != stored_path:
        delete_stored_upload(previous)
    return entity


def clear_entity_logo(session: Session, entity_id: uuid.UUID) -> Entity | None:
    entity = get_entity(session, entity_id)
    if entity is None:
        return None
    previous = entity.logo_stored_path
    entity.logo_stored_path = None
    entity.logo_media_type = None
    session.commit()
    session.refresh(entity)
    if previous:
        delete_stored_upload(previous)
    return entity


class EntityNotFoundError(LookupError):
    """No such restaurant, or it is already gone."""


def delete_entity(session: Session, entity_id: uuid.UUID) -> str:
    """Destroy a restaurant and everything recorded against it. No undo.

    Returns the name, so the caller can say what it deleted after the row that
    knew is gone.

    The delete itself is `delete_entity_cascade()`, a SECURITY DEFINER function
    in the database — see `app/db/entity_deletion.py`. It cannot happen here in
    Python, because the role this session connects as deliberately cannot
    disable the triggers that make the ledger undeletable, and giving the API
    that power generally would be a far larger hole than granting it this one
    function.

    Uploaded invoices, receipts and statements are not removed. They live
    outside the database under an `{entity_id}/` prefix, their paths buried in
    JSONB extraction payloads, and nothing points at them once the rows are
    gone. Orphaned files cost a little storage; a delete loop that walked JSONB
    looking for paths would be fragile in the one place that must not be.
    """
    entity = get_entity(session, entity_id)
    if entity is None:
        raise EntityNotFoundError(str(entity_id))
    name = entity.name

    # Detach just this row before the delete goes around SQLAlchemy's back.
    # Left in the identity map it would be flushed or refreshed against a row
    # that no longer exists.
    #
    # Not `expunge_all()`, which was the first attempt: that reaches past what
    # this function owns and detaches everything the caller had loaded — the
    # signed-in user among it — leaving the session it was handed in a worse
    # state than it found it.
    session.expunge(entity)

    removed = session.execute(
        text("SELECT delete_entity_cascade(:entity_id)"), {"entity_id": str(entity_id)}
    ).scalar_one()
    if removed != 1:
        # The function reports what it deleted. Zero means the row went between
        # the lookup and the call; anything else means it did not do what its
        # name says, and committing on that basis would be reckless.
        session.rollback()
        raise EntityNotFoundError(str(entity_id))

    session.commit()
    # `SessionLocal` sets `expire_on_commit=False`, so nothing above refreshes
    # itself. Everything entity-scoped the caller still holds — memberships,
    # settings — was carried off by the cascade, so make the session re-read
    # rather than serve rows that are gone.
    session.expire_all()
    return name


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
