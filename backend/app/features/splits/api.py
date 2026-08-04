"""Split hub HTTP routes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.auth.deps import member_read_guard, operations_write_guard, resolve_actor_id
from app.core.ledger.posting import InvalidAccountError, PostingError
from app.core.listing import ListParams, list_params_dependency
from app.core.partners.ledger import ZeroMovementError
from app.core.partners.posting import InvalidPartnerPostingError
from app.db.session import get_session
from app.features.auth.models import User
from app.features.splits import service
from app.features.splits.schema import (
    BankExpenseSplitCreate,
    BankExpenseSplitListOut,
    BankExpenseSplitResponse,
    SupplierPaymentSplitCreate,
    SupplierPaymentSplitListOut,
    SupplierPaymentSplitResponse,
)

router = APIRouter(prefix="/entities/{entity_id}/splits", tags=["splits"])


@router.get("/bank-expenses", response_model=BankExpenseSplitListOut)
def list_bank_expense_splits(
    entity_id: uuid.UUID,
    params: ListParams = Depends(list_params_dependency),
    q: str | None = Query(default=None),
    session: Session = Depends(get_session),
    _guard: User | None = Depends(member_read_guard),
) -> BankExpenseSplitListOut:
    try:
        return service.list_bank_expense_split_candidates(
            session, entity_id, params, q=q
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/bank-expenses",
    response_model=BankExpenseSplitResponse,
    status_code=201,
)
def post_bank_expense_split(
    entity_id: uuid.UUID,
    payload: BankExpenseSplitCreate,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> BankExpenseSplitResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.record_bank_expense_split(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError, InvalidPartnerPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/supplier-payments", response_model=SupplierPaymentSplitListOut)
def list_supplier_payment_splits(
    entity_id: uuid.UUID,
    params: ListParams = Depends(list_params_dependency),
    q: str | None = Query(default=None),
    session: Session = Depends(get_session),
    _guard: User | None = Depends(member_read_guard),
) -> SupplierPaymentSplitListOut:
    try:
        return service.list_supplier_payment_split_candidates(
            session, entity_id, params, q=q
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/supplier-payments",
    response_model=SupplierPaymentSplitResponse,
    status_code=201,
)
def post_supplier_payment_split(
    entity_id: uuid.UUID,
    payload: SupplierPaymentSplitCreate,
    session: Session = Depends(get_session),
    _guard: User | None = Depends(operations_write_guard),
) -> SupplierPaymentSplitResponse:
    payload.actor_id = resolve_actor_id(_guard, payload.actor_id)
    try:
        return service.record_supplier_payment_split(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (ZeroMovementError, ValueError, InvalidPartnerPostingError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PostingError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
