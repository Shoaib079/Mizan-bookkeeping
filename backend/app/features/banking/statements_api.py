"""Bank statement HTTP routes — import and classify (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.adapters.bank_parsers.types import BankParseError
from app.core.receivables.ledger import OverpaymentError
from app.core.payables.ledger import OverpaymentError as SupplierOverpaymentError
from app.core.banking.posting import InvalidTransferError
from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.banking import statements as statement_service
from app.features.banking.schema import (
    BankStatementRead,
    ClassifyStatementLineRequest,
    ClassifyStatementLineResult,
)

accounts_router = APIRouter(
    prefix="/entities/{entity_id}/banking/accounts",
    tags=["banking"],
)

statements_router = APIRouter(
    prefix="/entities/{entity_id}/banking/statements",
    tags=["banking"],
)


@accounts_router.post(
    "/{money_account_id}/statements",
    response_model=BankStatementRead,
    status_code=201,
)
async def import_bank_statement(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> BankStatementRead:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        return statement_service.import_bank_statement(
            session,
            entity_id,
            money_account_id,
            content,
            original_filename=file.filename or "statement.csv",
            content_type=file.content_type,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except statement_service.DuplicateStatementError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except statement_service.OverlappingPeriodError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except statement_service.NotBankAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (BankParseError, statement_service.InvalidClassificationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@accounts_router.get(
    "/{money_account_id}/statements",
    response_model=PaginatedListOut[BankStatementRead],
)
def list_bank_statements(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[BankStatementRead]:
    try:
        items, total = statement_service.list_bank_statements(
            session,
            entity_id,
            money_account_id,
            from_date=from_date,
            to_date=to_date,
            list_params=list_params,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except statement_service.NotBankAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return paginated_list(
        items,
        total=total,
        limit=list_params.limit,
        offset=list_params.offset,
    )


@statements_router.get("/{statement_id}", response_model=BankStatementRead)
def get_bank_statement(
    entity_id: uuid.UUID,
    statement_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> BankStatementRead:
    try:
        return statement_service.get_bank_statement(session, entity_id, statement_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@statements_router.patch(
    "/{statement_id}/lines/{line_id}/classify",
    response_model=ClassifyStatementLineResult,
)
def classify_statement_line(
    entity_id: uuid.UUID,
    statement_id: uuid.UUID,
    line_id: uuid.UUID,
    payload: ClassifyStatementLineRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> ClassifyStatementLineResult:
    try:
        return statement_service.classify_statement_line(
            session,
            entity_id,
            statement_id,
            line_id,
            classification=payload.classification,
            supplier_id=payload.supplier_id,
            counterpart_money_account_id=payload.counterpart_money_account_id,
            credit_card_money_account_id=payload.credit_card_money_account_id,
            customer_id=payload.customer_id,
            actor_id=payload.actor_id,
            confirm_supplier_ledger_entry_id=payload.confirm_supplier_ledger_entry_id,
            confirm_account_transfer_id=payload.confirm_account_transfer_id,
            delivery_platform_id=payload.delivery_platform_id,
            expense_account_id=payload.expense_account_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except statement_service.LineAlreadyResolvedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except SupplierOverpaymentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OverpaymentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidTransferError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except statement_service.InvalidClassificationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
