"""Bank/cash account tree HTTP routes — thin handlers (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.features.banking import service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import (
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


@router.get("", response_model=list[MoneyAccountRead])
def list_money_accounts(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    account_kind: MoneyAccountKind | None = Query(default=None),
    include_inactive: bool = Query(default=False),
) -> list[MoneyAccountRead]:
    try:
        return service.list_money_accounts(
            session,
            entity_id,
            account_kind=account_kind,
            include_inactive=include_inactive,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/tree", response_model=MoneyAccountTree)
def get_account_tree(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
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
) -> MoneyAccountRead:
    try:
        return service.get_money_account(session, entity_id, money_account_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/{money_account_id}", response_model=MoneyAccountRead)
def update_money_account(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    payload: MoneyAccountUpdate,
    session: Session = Depends(get_session),
) -> MoneyAccountRead:
    try:
        return service.update_money_account(
            session, entity_id, money_account_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.DuplicateMoneyAccountError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
