"""Daily expenses HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.expenses.items import InvalidExpenseItemError
from app.core.expenses.posting import InvalidExpensePostingError
from app.core.ledger.posting import InvalidAccountError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.expenses import service as expenses_service
from app.features.expenses.models import ExpenseEntryStatus
from app.features.expenses.schema import (
    ExpenseConfirmItemRequest,
    ExpenseCreate,
    ExpenseItemCreate,
    ExpenseItemMergeRequest,
    ExpenseItemRead,
    ExpenseRead,
)
from app.features.expenses.service import ExpenseNotReviewableError

router = APIRouter(prefix="/entities/{entity_id}", tags=["expenses"])


@router.post("/expense-items", response_model=ExpenseItemRead, status_code=201)
def create_expense_item(
    entity_id: uuid.UUID,
    payload: ExpenseItemCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> ExpenseItemRead:
    try:
        return expenses_service.create_expense_item(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidExpenseItemError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/expense-items", response_model=list[ExpenseItemRead])
def list_expense_items(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
) -> list[ExpenseItemRead]:
    try:
        return expenses_service.list_expense_items(
            session, entity_id, include_inactive=include_inactive
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/expense-items/merge", response_model=ExpenseItemRead)
def merge_expense_items(
    entity_id: uuid.UUID,
    payload: ExpenseItemMergeRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> ExpenseItemRead:
    try:
        return expenses_service.merge_items(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidExpenseItemError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/expenses", response_model=ExpenseRead, status_code=201)
def create_expense(
    entity_id: uuid.UUID,
    payload: ExpenseCreate,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> ExpenseRead:
    try:
        return expenses_service.create_expense(session, entity_id, payload)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except (InvalidExpensePostingError, InvalidAccountError, InvalidExpenseItemError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/expenses", response_model=list[ExpenseRead])
def list_expenses(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    status: ExpenseEntryStatus | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
) -> list[ExpenseRead]:
    try:
        return expenses_service.list_expenses(
            session,
            entity_id,
            status=status,
            from_date=from_date,
            to_date=to_date,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/expenses/{expense_id}/confirm-item", response_model=ExpenseRead)
def confirm_expense_item(
    entity_id: uuid.UUID,
    expense_id: uuid.UUID,
    payload: ExpenseConfirmItemRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> ExpenseRead:
    try:
        return expenses_service.confirm_expense_item(
            session, entity_id, expense_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ExpenseNotReviewableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (InvalidExpensePostingError, InvalidAccountError, InvalidExpenseItemError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
