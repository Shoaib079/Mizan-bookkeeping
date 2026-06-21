"""Payables HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.payables.ledger import (
    DisallowedMovementTypeError,
    OverpaymentError,
    ZeroMovementError,
)
from app.db.session import get_session
from app.features.payables import service
from app.features.payables.schema import (
    PayablesSummaryRead,
    SupplierLedgerRead,
    SupplierMovementCreate,
    SupplierPaymentCreate,
    SupplierPayableBalanceRead,
    SupplierLedgerEntryRead,
)

router = APIRouter(prefix="/entities/{entity_id}", tags=["payables"])


@router.get("/payables", response_model=PayablesSummaryRead)
def list_payables(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> PayablesSummaryRead:
    try:
        total, rows = service.list_payables(session, entity_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return PayablesSummaryRead(
        total_payables_kurus=total,
        suppliers=[
            SupplierPayableBalanceRead(
                supplier_id=supplier.id,
                supplier_name=supplier.name,
                vkn=supplier.vkn,
                balance_kurus=balance,
            )
            for supplier, balance in rows
        ],
    )


@router.get("/suppliers/{supplier_id}/ledger", response_model=SupplierLedgerRead)
def get_supplier_ledger(
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> SupplierLedgerRead:
    try:
        balance, entries = service.get_supplier_ledger(session, entity_id, supplier_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return SupplierLedgerRead(
        supplier_id=supplier_id,
        balance_kurus=balance,
        entries=[SupplierLedgerEntryRead.model_validate(e) for e in entries],
    )


@router.post(
    "/suppliers/{supplier_id}/ledger/movements",
    response_model=SupplierLedgerEntryRead,
    status_code=201,
)
def record_supplier_movement(
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    payload: SupplierMovementCreate,
    session: Session = Depends(get_session),
) -> SupplierLedgerEntryRead:
    try:
        entry = service.record_movement(
            session,
            entity_id,
            supplier_id,
            movement_date=payload.movement_date,
            movement_type=payload.movement_type,
            amount_kurus=payload.amount_kurus,
            description=payload.description,
            actor_id=payload.actor_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ZeroMovementError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DisallowedMovementTypeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return SupplierLedgerEntryRead.model_validate(entry)


@router.post(
    "/suppliers/{supplier_id}/payments",
    response_model=SupplierLedgerEntryRead,
    status_code=201,
)
def record_supplier_payment(
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    payload: SupplierPaymentCreate,
    session: Session = Depends(get_session),
) -> SupplierLedgerEntryRead:
    try:
        entry = service.record_payment(
            session,
            entity_id,
            supplier_id,
            payment_date=payload.payment_date,
            amount_kurus=payload.amount_kurus,
            description=payload.description,
            actor_id=payload.actor_id,
            reference=payload.reference,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ZeroMovementError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OverpaymentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return SupplierLedgerEntryRead.model_validate(entry)
