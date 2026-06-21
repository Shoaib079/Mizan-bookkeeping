"""Bank statement HTTP routes — import and classify (ARCHITECTURE.md)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.adapters.bank_parsers.csv_simple import CsvParseError
from app.core.payables.ledger import OverpaymentError
from app.core.banking.posting import InvalidTransferError
from app.db.session import get_session
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
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except statement_service.DuplicateStatementError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except statement_service.OverlappingPeriodError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except statement_service.NotBankAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except (CsvParseError, statement_service.InvalidClassificationError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@accounts_router.get(
    "/{money_account_id}/statements",
    response_model=list[BankStatementRead],
)
def list_bank_statements(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    session: Session = Depends(get_session),
) -> list[BankStatementRead]:
    try:
        return statement_service.list_bank_statements(
            session, entity_id, money_account_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except statement_service.NotBankAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@statements_router.get("/{statement_id}", response_model=BankStatementRead)
def get_bank_statement(
    entity_id: uuid.UUID,
    statement_id: uuid.UUID,
    session: Session = Depends(get_session),
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
            actor_id=payload.actor_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except statement_service.LineAlreadyResolvedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except OverpaymentError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except InvalidTransferError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except statement_service.InvalidClassificationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
