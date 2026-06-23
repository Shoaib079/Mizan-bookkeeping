"""Daily expenses HTTP routes (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.adapters.ocr_ai.expense_photo import ExpensePhotoExtractionError
from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.core.expenses.items import InvalidExpenseItemError
from app.core.expenses.posting import InvalidExpensePostingError
from app.core.ledger.posting import InvalidAccountError
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.expenses import service as expenses_service
from app.features.expenses.models import ExpenseEntryStatus
from app.features.expenses.schema import (
    ConfirmTipPhotoRequest,
    ExpenseConfirmItemRequest,
    ExpenseCreate,
    ExpenseItemCreate,
    ExpenseItemMergeRequest,
    ExpenseItemRead,
    ExpenseRead,
)
from app.features.expenses.service import (
    DuplicateExpenseDocumentError,
    ExpenseNotReviewableError,
    NotATipPhotoError,
)

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


@router.get("/expense-items", response_model=PaginatedListOut[ExpenseItemRead])
def list_expense_items(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    include_inactive: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=256),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[ExpenseItemRead]:
    try:
        items, total = expenses_service.list_expense_items(
            session,
            entity_id,
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


@router.get("/expenses", response_model=PaginatedListOut[ExpenseRead])
def list_expenses(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    status: ExpenseEntryStatus | None = Query(default=None),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    q: str | None = Query(default=None, max_length=256),
    min_amount: int | None = Query(default=None, alias="min_amount"),
    max_amount: int | None = Query(default=None, alias="max_amount"),
    expense_account_id: uuid.UUID | None = Query(default=None),
    money_account_id: uuid.UUID | None = Query(default=None),
    expense_item_id: uuid.UUID | None = Query(default=None),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[ExpenseRead]:
    try:
        items, total = expenses_service.list_expenses(
            session,
            entity_id,
            status=status,
            from_date=from_date,
            to_date=to_date,
            q=q,
            min_amount=min_amount,
            max_amount=max_amount,
            expense_account_id=expense_account_id,
            money_account_id=money_account_id,
            expense_item_id=expense_item_id,
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


@router.post("/expenses/tip-photos", response_model=ExpenseRead, status_code=201)
async def upload_tip_photo(
    entity_id: uuid.UUID,
    file: UploadFile = File(...),
    money_account_id: uuid.UUID = Form(...),
    actor_id: uuid.UUID = Form(...),
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> ExpenseRead:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        return expenses_service.create_tip_expense_from_photo(
            session,
            entity_id,
            content,
            money_account_id=money_account_id,
            actor_id=actor_id,
            filename=file.filename,
            content_type=file.content_type,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except DuplicateExpenseDocumentError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Duplicate expense document for this entity",
                "existing_expense_id": str(exc.existing.id),
            },
        ) from exc
    except ExpensePhotoExtractionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (InvalidExpensePostingError, InvalidAccountError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/expenses/tip-photos/{expense_id}/confirm", response_model=ExpenseRead)
def confirm_tip_photo(
    entity_id: uuid.UUID,
    expense_id: uuid.UUID,
    payload: ConfirmTipPhotoRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> ExpenseRead:
    try:
        return expenses_service.confirm_tip_expense(
            session, entity_id, expense_id, payload
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except NotATipPhotoError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ExpenseNotReviewableError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (InvalidExpensePostingError, InvalidAccountError, InvalidExpenseItemError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


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
