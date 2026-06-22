"""FX purchase HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.fx.average_cost import InsufficientFxBalanceError
from app.core.fx.posting import InvalidFxPurchaseError
from app.core.fx.spend_posting import InvalidFxSpendError
from app.core.ledger.posting import InvalidAccountError
from app.db.session import get_session
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
) -> FxExpenseSpendResponse:
    try:
        return fx_service.create_fx_expense_spend(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidFxSpendError, InvalidAccountError, InsufficientFxBalanceError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/accounts/{fx_money_account_id}/ledger", response_model=list[FxLedgerEntryRead])
def get_fx_ledger(
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> list[FxLedgerEntryRead]:
    try:
        return fx_service.get_fx_ledger(session, entity_id, fx_money_account_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/accounts/{fx_money_account_id}/balance", response_model=FxBalanceRead)
def get_fx_balance(
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> FxBalanceRead:
    try:
        return fx_service.get_fx_balance(session, entity_id, fx_money_account_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
