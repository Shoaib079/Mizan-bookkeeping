"""Supplier master service — entity-scoped CRUD (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.listing import ListParams, fetch_paginated, text_search_filter
from app.adapters.ocr_ai.efatura import sanitize_supplier_name
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.suppliers.models import Supplier
from app.features.suppliers.schema import SupplierCreate, SupplierUpdate, validate_vkn


class DuplicateSupplierError(Exception):
    """Raised when a supplier VKN already exists for the entity."""

_EFATURA_AUTO_SUPPLIER_NOTE = "Auto-created from e-Fatura upload"


def _efatura_supplier_display_name(name: str | None, vkn: str) -> str:
    cleaned = (name or "").strip()
    return cleaned[:512] if cleaned else f"Supplier {vkn}"


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
            auto_post_payments=payload.auto_post_payments,
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
        if payload.auto_post_payments is not None:
            supplier.auto_post_payments = payload.auto_post_payments

        session.commit()
        session.refresh(supplier)
        return supplier


def find_by_vkn(session: Session, entity_id: uuid.UUID, vkn: str) -> Supplier | None:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        return session.scalar(select(Supplier).where(Supplier.vkn == vkn))


def find_or_create_supplier_for_efatura(
    session: Session,
    entity_id: uuid.UUID,
    *,
    supplier_vkn: str,
    supplier_name: str | None = None,
    entity_vkn: str | None = None,
    entity_name: str | None = None,
    entity_legal_name: str | None = None,
) -> Supplier | None:
    """Link intake to supplier master — create row when VKN is new (e-Fatura upload)."""
    vkn = validate_vkn(supplier_vkn)
    if entity_vkn and vkn == validate_vkn(entity_vkn):
        return None

    buyer_names = tuple(
        name.strip()
        for name in (entity_legal_name, entity_name)
        if name and name.strip()
    )
    safe_name = sanitize_supplier_name(supplier_name, buyer_names=buyer_names)

    existing = find_by_vkn(session, entity_id, vkn)
    if existing is not None:
        return existing

    try:
        return create_supplier(
            session,
            entity_id,
            SupplierCreate(
                name=_efatura_supplier_display_name(safe_name, vkn),
                vkn=vkn,
                notes=_EFATURA_AUTO_SUPPLIER_NOTE,
            ),
        )
    except DuplicateSupplierError:
        return find_by_vkn(session, entity_id, vkn)
