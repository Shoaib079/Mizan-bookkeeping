"""Supplier master service — entity-scoped CRUD (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.suppliers.models import Supplier
from app.features.suppliers.schema import SupplierCreate, SupplierUpdate


class DuplicateSupplierError(Exception):
    """Raised when a supplier VKN already exists for the entity."""


def create_supplier(
    session: Session, entity_id: uuid.UUID, payload: SupplierCreate
) -> Supplier:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        supplier = Supplier(
            name=payload.name,
            vkn=payload.vkn,
            iban=payload.iban,
            notes=payload.notes,
        )
        session.add(supplier)
        try:
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            raise DuplicateSupplierError(
                f"Supplier with VKN {payload.vkn} already exists for this entity"
            ) from exc
        session.refresh(supplier)
        return supplier


def list_suppliers(
    session: Session,
    entity_id: uuid.UUID,
    *,
    include_inactive: bool = False,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[Supplier], int]:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    params = list_params or ListParams()
    with entity_context(session, entity_id):
        require_entity_context()
        filters = []
        if not include_inactive:
            filters.append(Supplier.is_active.is_(True))
        search = text_search_filter(q, Supplier.name, Supplier.vkn)
        if search is not None:
            filters.append(search)
        stmt = select(Supplier).where(*filters).order_by(Supplier.name)
        return fetch_paginated(session, stmt, params)


def get_supplier(
    session: Session, entity_id: uuid.UUID, supplier_id: uuid.UUID
) -> Supplier:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        supplier = session.get(Supplier, supplier_id)
        if supplier is None:
            raise LookupError("Supplier not found")
        return supplier


def update_supplier(
    session: Session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    payload: SupplierUpdate,
) -> Supplier:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        supplier = session.get(Supplier, supplier_id)
        if supplier is None:
            raise LookupError("Supplier not found")

        if payload.name is not None:
            supplier.name = payload.name
        if payload.iban is not None:
            supplier.iban = payload.iban
        if payload.notes is not None:
            supplier.notes = payload.notes
        if payload.is_active is not None:
            supplier.is_active = payload.is_active

        session.commit()
        session.refresh(supplier)
        return supplier


def find_by_vkn(session: Session, entity_id: uuid.UUID, vkn: str) -> Supplier | None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        return session.scalar(select(Supplier).where(Supplier.vkn == vkn))
