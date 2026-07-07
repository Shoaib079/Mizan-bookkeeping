"""Bank/cash account tree HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.banking import credit_card_payments as cc_payment_service
from app.features.banking import service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import (
    CreditCardPaymentRead,
    MoneyAccountCreate,
    MoneyAccountRead,
    MoneyAccountTree,
    MoneyAccountUpdate,
)

router = APIRouter(prefix="/entities/{entity_id}/banking/accounts", tags=["banking"])


@router.post("", response_model=MoneyAccountRead, status_code=201)
def create_money_account(
    entity_id: uuid.UUID,
    payload: MoneyAccountCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> MoneyAccountRead:
    try:
        return service.create_money_account(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.ChartNotSeededError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except service.DuplicateMoneyAccountError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except service.InvalidMoneyAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("", response_model=PaginatedListOut[MoneyAccountRead])
def list_money_accounts(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    account_kind: MoneyAccountKind | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[MoneyAccountRead]:
    try:
        items, total = service.list_money_accounts(
            session,
            entity_id,
            account_kind=account_kind,
            include_inactive=include_inactive,
            q=q,
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


@router.get("/tree", response_model=MoneyAccountTree)
def get_account_tree(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
) -> MoneyAccountTree:
    try:
        return service.get_account_tree(
            session, entity_id, include_inactive=include_inactive
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.ChartNotSeededError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{money_account_id}", response_model=MoneyAccountRead)
def get_money_account(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> MoneyAccountRead:
    try:
        return service.get_money_account(session, entity_id, money_account_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/{money_account_id}/credit-card-payments",
    response_model=PaginatedListOut[CreditCardPaymentRead],
)
def list_credit_card_payments(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None),
    max_amount: int | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[CreditCardPaymentRead]:
    try:
        items, total = cc_payment_service.list_credit_card_payments(
            session,
            entity_id,
            money_account_id,
            from_date=from_date,
            to_date=to_date,
            q=q,
            min_amount=min_amount,
            max_amount=max_amount,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except cc_payment_service.InvalidCreditCardAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return paginated_list(
        items,
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@router.patch("/{money_account_id}", response_model=MoneyAccountRead)
def update_money_account(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    payload: MoneyAccountUpdate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> MoneyAccountRead:
    try:
        return service.update_money_account(
            session, entity_id, money_account_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DuplicateMoneyAccountError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
