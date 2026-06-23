"""FX purchase HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list

from app.core.fx.average_cost import InsufficientFxBalanceError
from app.core.fx.posting import InvalidFxPurchaseError
from app.core.fx.spend_posting import InvalidFxSpendError
from app.core.ledger.posting import InvalidAccountError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.fx import service as fx_service
from app.features.fx.schema import (
    FxBalanceRead,
    FxConversionCreate,
    FxConversionResponse,
    FxExpenseSpendCreate,
    FxExpenseSpendResponse,
    FxLedgerEntryRead,
    FxPurchaseCreate,
    FxPurchaseResponse,
)

router = APIRouter(prefix="/entities/{entity_id}/fx", tags=["fx"])


@router.post("/purchases", response_model=FxPurchaseResponse, status_code=201)
def create_fx_purchase(
    entity_id: uuid.UUID,
    payload: FxPurchaseCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> FxPurchaseResponse:
    try:
        return fx_service.create_fx_purchase(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidFxPurchaseError, InvalidAccountError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/conversions", response_model=FxConversionResponse, status_code=201)
def create_fx_conversion(
    entity_id: uuid.UUID,
    payload: FxConversionCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> FxConversionResponse:
    try:
        return fx_service.create_fx_conversion(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidFxSpendError, InvalidAccountError, InsufficientFxBalanceError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/expense-spends", response_model=FxExpenseSpendResponse, status_code=201)
def create_fx_expense_spend(
    entity_id: uuid.UUID,
    payload: FxExpenseSpendCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> FxExpenseSpendResponse:
    try:
        return fx_service.create_fx_expense_spend(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidFxSpendError, InvalidAccountError, InsufficientFxBalanceError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/accounts/{fx_money_account_id}/ledger", response_model=PaginatedListOut[FxLedgerEntryRead])
def get_fx_ledger(
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None),
    max_amount: int | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[FxLedgerEntryRead]:
    try:
        items, total = fx_service.get_fx_ledger(
            session,
            entity_id,
            fx_money_account_id,
            from_date=from_date,
            to_date=to_date,
            q=q,
            min_amount=min_amount,
            max_amount=max_amount,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return paginated_list(
        items,
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@router.get("/accounts/{fx_money_account_id}/balance", response_model=FxBalanceRead)
def get_fx_balance(
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> FxBalanceRead:
    try:
        return fx_service.get_fx_balance(session, entity_id, fx_money_account_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
