"""Payables HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, list_params_dependency

from app.core.ledger.correction import CorrectionNotFoundError
from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.payables.ledger import (
    DisallowedMovementTypeError,
    OverpaymentError,
    ZeroMovementError,
)
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.payables import service
from app.features.payables.schema import (
    PayablesSummaryRead,
    SupplierLedgerRead,
    SupplierMovementCreate,
    SupplierPaymentCreate,
    SupplierPaymentCorrect,
    SupplierPaymentCorrectOut,
    SupplierPaymentRead,
    SupplierPayableBalanceRead,
    SupplierLedgerEntryRead,
)

router = APIRouter(prefix="/entities/{entity_id}", tags=["payables"])


@router.get("/payables", response_model=PayablesSummaryRead)
def list_payables(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PayablesSummaryRead:
    try:
        total_payables, rows, total = service.list_payables(
            session, entity_id, q=q, list_params=list_params
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return PayablesSummaryRead(
        total_payables_kurus=total_payables,
        suppliers=[
            SupplierPayableBalanceRead(
                supplier_id=supplier.id,
                supplier_name=supplier.name,
                vkn=supplier.vkn,
                balance_kurus=balance,
            )
            for supplier, balance in rows
        ],
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@router.get("/suppliers/{supplier_id}/ledger", response_model=SupplierLedgerRead)
def get_supplier_ledger(
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
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
    _: None = Depends(operations_write_guard),
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
    except (ValueError, InvalidAccountError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return SupplierLedgerEntryRead.model_validate(entry)


@router.post(
    "/suppliers/{supplier_id}/payments",
    response_model=SupplierPaymentRead,
    status_code=201,
)
def post_supplier_payment(
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    payload: SupplierPaymentCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> SupplierPaymentRead:
    try:
        result = service.record_payment(
            session,
            entity_id,
            supplier_id,
            payment_date=payload.payment_date,
            amount_kurus=payload.amount_kurus,
            description=payload.description,
            actor_id=payload.actor_id,
            payment_account_id=payload.payment_account_id,
            reference=payload.reference,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OverpaymentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return SupplierPaymentRead(
        journal_entry_id=result.journal_entry.id,
        supplier_ledger_entry=SupplierLedgerEntryRead.model_validate(
            result.supplier_ledger_entry
        ),
        payable_balance_kurus=result.payable_balance_kurus,
    )


@router.post(
    "/suppliers/{supplier_id}/payments/{journal_entry_id}/correct",
    response_model=SupplierPaymentCorrectOut,
)
def correct_supplier_payment(
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: SupplierPaymentCorrect,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> SupplierPaymentCorrectOut:
    try:
        result, balance, new_row = service.correct_supplier_payment_entry(
            session,
            entity_id,
            supplier_id,
            journal_entry_id,
            payment_date=payload.payment_date,
            amount_kurus=payload.amount_kurus,
            description=payload.description,
            actor_id=payload.actor_id,
            payment_account_id=payload.payment_account_id,
            reference=payload.reference,
            reason=payload.reason,
            void_date=payload.void_date,
            period_unlock_reason=payload.period_unlock_reason,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CorrectionNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OverpaymentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    assert new_row is not None
    return SupplierPaymentCorrectOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
        corrected_journal_entry_id=result.corrected.id,
        supplier_ledger_entry=SupplierLedgerEntryRead.model_validate(new_row),
        payable_balance_kurus=balance,
    )
