"""Supplier master HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.suppliers import service
from app.features.suppliers.schema import SupplierCreate, SupplierRead, SupplierUpdate, validate_vkn

router = APIRouter(prefix="/entities/{entity_id}/suppliers", tags=["suppliers"])


@router.post("", response_model=SupplierRead, status_code=201)
def create_supplier(
    entity_id: uuid.UUID,
    payload: SupplierCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> SupplierRead:
    try:
        supplier = service.create_supplier(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DuplicateSupplierError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return SupplierRead.model_validate(supplier)


@router.get("", response_model=list[SupplierRead])
def list_suppliers(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
) -> list[SupplierRead]:
    try:
        suppliers = service.list_suppliers(
            session, entity_id, include_inactive=include_inactive
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return [SupplierRead.model_validate(s) for s in suppliers]


@router.get("/by-vkn/{vkn}", response_model=SupplierRead)
def get_supplier_by_vkn(
    entity_id: uuid.UUID,
    vkn: str,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> SupplierRead:
    try:
        validate_vkn(vkn)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        supplier = service.find_by_vkn(session, entity_id, vkn)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return SupplierRead.model_validate(supplier)


@router.get("/{supplier_id}", response_model=SupplierRead)
def get_supplier(
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> SupplierRead:
    try:
        supplier = service.get_supplier(session, entity_id, supplier_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return SupplierRead.model_validate(supplier)


@router.patch("/{supplier_id}", response_model=SupplierRead)
def update_supplier(
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    payload: SupplierUpdate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> SupplierRead:
    try:
        supplier = service.update_supplier(session, entity_id, supplier_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return SupplierRead.model_validate(supplier)
