"""Per-entity delivery platform management (Decisions §9)."""

from __future__ import annotations

import uuid
from contextlib import contextmanager

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import DELIVERY_CLEARING_PARENT_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.listing import ListParams, fetch_paginated_rows, text_search_filter
from app.db.base import utcnow
from app.db.session import (
    entity_context,
    get_current_entity_id,
    require_entity_context,
    _apply_entity_guc,
)
from app.features.delivery.models import OwnedDeliveryPlatform
from app.features.delivery.platform_schema import (
    DeliveryPlatformCreate,
    DeliveryPlatformRead,
    DeliveryPlatformUpdate,
)
from app.features.delivery.settings import DeliveryNotEnabledError, require_delivery_enabled
from app.features.entities import service as entity_service



def _with_entity_context(session: Session, entity_id: uuid.UUID):
    """Ensure Python + PostgreSQL entity context before RLS-scoped queries."""
    if get_current_entity_id() == entity_id:

        @contextmanager
        def _resync():
            _apply_entity_guc(session, entity_id)
            try:
                yield session
            finally:
                pass

        return _resync()
    return entity_context(session, entity_id)


class DuplicateDeliveryPlatformError(Exception):
    """A platform with this name already exists for the entity."""


class DeliveryPlatformNotFoundError(LookupError):
    """Delivery platform not found for this entity."""


class InactiveDeliveryPlatformError(ValueError):
    """Platform is deactivated — cannot use for new intake."""


class ChartNotReadyError(ValueError):
    """Delivery clearing parent account missing — seed chart first."""


def _next_sub_account_code(session: Session, parent: Account) -> str:
    parent_num = int(parent.code)
    child_codes = session.scalars(
        select(Account.code).where(Account.parent_account_id == parent.id)
    ).all()
    if not child_codes:
        return str(parent_num + 1)
    return str(max(int(code) for code in child_codes) + 1)


def _get_clearing_parent(session: Session) -> Account:
    parent = session.scalar(
        select(Account).where(Account.code == DELIVERY_CLEARING_PARENT_CODE)
    )
    if parent is None:
        raise ChartNotReadyError(
            f"Chart missing delivery clearing parent {DELIVERY_CLEARING_PARENT_CODE}"
        )
    return parent


def _to_read(platform: OwnedDeliveryPlatform, gl_account: Account) -> DeliveryPlatformRead:
    return DeliveryPlatformRead(
        id=platform.id,
        entity_id=platform.entity_id,
        name=platform.name,
        gl_account_id=gl_account.id,
        gl_account_code=gl_account.code,
        is_active=platform.is_active,
        created_at=platform.created_at,
        updated_at=platform.updated_at,
    )


def create_delivery_platform(
    session: Session,
    entity_id: uuid.UUID,
    payload: DeliveryPlatformCreate,
) -> DeliveryPlatformRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    require_delivery_enabled(session, entity_id)

    name = payload.name.strip()
    if not name:
        raise ValueError("platform name is required")

    with entity_context(session, entity_id):
        require_entity_context()
        parent = _get_clearing_parent(session)
        code = _next_sub_account_code(session, parent)

        gl_account = Account(
            code=code,
            name_en=f"{name} Clearing",
            name_tr=f"{name} Takas",
            account_type=AccountType.ASSET,
            normal_balance=AccountNormalBalance.DEBIT,
            accepts_opening_balance=True,
            parent_account_id=parent.id,
        )
        session.add(gl_account)
        session.flush()

        platform = OwnedDeliveryPlatform(
            name=name,
            gl_account_id=gl_account.id,
            is_active=True,
        )
        session.add(platform)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise DuplicateDeliveryPlatformError(
                f"Delivery platform named {name!r} already exists"
            ) from exc
        session.refresh(platform)
        session.refresh(gl_account)
        return _to_read(platform, gl_account)


def list_delivery_platforms(
    session: Session,
    entity_id: uuid.UUID,
    *,
    include_inactive: bool = False,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[DeliveryPlatformRead], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if not include_inactive:
            filters.append(OwnedDeliveryPlatform.is_active.is_(True))
        search = text_search_filter(q, OwnedDeliveryPlatform.name)
        if search is not None:
            filters.append(search)
        stmt = (
            select(OwnedDeliveryPlatform, Account)
            .join(Account, OwnedDeliveryPlatform.gl_account_id == Account.id)
            .where(*filters)
            .order_by(OwnedDeliveryPlatform.name)
        )
        rows, total = fetch_paginated_rows(session, stmt, params)
        return [_to_read(platform, gl_account) for platform, gl_account in rows], total


def get_delivery_platform(
    session: Session,
    entity_id: uuid.UUID,
    platform_id: uuid.UUID,
) -> DeliveryPlatformRead:
    with _with_entity_context(session, entity_id):
        row = session.execute(
            select(OwnedDeliveryPlatform, Account)
            .join(Account, OwnedDeliveryPlatform.gl_account_id == Account.id)
            .where(OwnedDeliveryPlatform.id == platform_id)
        ).first()
        if row is None:
            raise DeliveryPlatformNotFoundError("Delivery platform not found")
        platform, gl_account = row
        return _to_read(platform, gl_account)


def get_delivery_platform_row(
    session: Session,
    entity_id: uuid.UUID,
    platform_id: uuid.UUID,
) -> OwnedDeliveryPlatform:
    with _with_entity_context(session, entity_id):
        platform = session.get(OwnedDeliveryPlatform, platform_id)
        if platform is None:
            raise DeliveryPlatformNotFoundError("Delivery platform not found")
        return platform


def update_delivery_platform(
    session: Session,
    entity_id: uuid.UUID,
    platform_id: uuid.UUID,
    payload: DeliveryPlatformUpdate,
) -> DeliveryPlatformRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    require_delivery_enabled(session, entity_id)

    with entity_context(session, entity_id):
        require_entity_context()
        platform = session.get(OwnedDeliveryPlatform, platform_id)
        if platform is None:
            raise DeliveryPlatformNotFoundError("Delivery platform not found")
        gl_account = session.get(Account, platform.gl_account_id)
        if gl_account is None:
            raise ChartNotReadyError("Platform clearing GL account not found")

        if payload.name is not None:
            name = payload.name.strip()
            if not name:
                raise ValueError("platform name is required")
            platform.name = name
            gl_account.name_en = f"{name} Clearing"
            gl_account.name_tr = f"{name} Takas"

        if payload.is_active is not None:
            platform.is_active = payload.is_active

        platform.updated_at = utcnow()
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise DuplicateDeliveryPlatformError(
                f"Delivery platform named {payload.name!r} already exists"
            ) from exc
        session.refresh(platform)
        session.refresh(gl_account)
        return _to_read(platform, gl_account)


def require_active_delivery_platform(
    session: Session,
    entity_id: uuid.UUID,
    platform_id: uuid.UUID,
) -> OwnedDeliveryPlatform:
    require_delivery_enabled(session, entity_id)
    platform = get_delivery_platform_row(session, entity_id, platform_id)
    if not platform.is_active:
        raise InactiveDeliveryPlatformError(
            f"Delivery platform {platform.name!r} is deactivated"
        )
    return platform
