"""Bank statement HTTP routes — import and classify (ARCHITECTURE.md)."""

from __future__ import annotations

import json
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.adapters.bank_parsers.profile_mapper import BankImportProfileConfig
from app.adapters.bank_parsers.types import BankParseError
from app.core.receivables.ledger import OverpaymentError
from app.core.payables.ledger import OverpaymentError as SupplierOverpaymentError
from app.core.banking.posting import InvalidTransferError
from app.core.listing import ListParams, PaginatedListOut, list_params_dependency, paginated_list
from app.db.session import get_session
from app.core.auth.deps import member_read_guard, operations_write_guard
from app.features.banking import import_profiles as import_profile_service
from app.features.banking import statements as statement_service
from app.features.suppliers.service import DuplicateSupplierError
from app.features.banking.schema import (
    BankImportProfileRead,
    BankImportProfileUpsert,
    BankStatementPreview,
    BankStatementRead,
    ClassifyStatementLineRequest,
    ClassifyStatementLineResult,
    CreateSupplierFromLineRequest,
    CreateSupplierFromLineResult,
    NeedsReviewStatementLineRead,
)

accounts_router = APIRouter(
    prefix="/entities/{entity_id}/banking/accounts",
    tags=["banking"],
)

statements_router = APIRouter(
    prefix="/entities/{entity_id}/banking/statements",
    tags=["banking"],
)


def _parse_profile_form(profile: str | None) -> BankImportProfileConfig | None:
    if not profile or not profile.strip():
        return None
    try:
        payload = json.loads(profile)
        return BankImportProfileConfig.model_validate(payload)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid profile mapping: {exc}") from exc


@accounts_router.post(
    "/{money_account_id}/statements/preview",
    response_model=BankStatementPreview,
)
async def preview_bank_statement(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> BankStatementPreview:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        import_profile_service.get_import_profile(session, entity_id, money_account_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except statement_service.NotBankAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        return import_profile_service.preview_statement_upload(
            content,
            original_filename=file.filename,
            content_type=file.content_type,
        )
    except BankParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@accounts_router.get(
    "/{money_account_id}/import-profile",
    response_model=BankImportProfileRead,
)
def get_bank_import_profile(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
) -> BankImportProfileRead:
    try:
        profile = import_profile_service.get_import_profile_read(
            session, entity_id, money_account_id
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except statement_service.NotBankAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if profile is None:
        raise HTTPException(status_code=404, detail="No saved import profile for this account")
    return profile


@accounts_router.put(
    "/{money_account_id}/import-profile",
    response_model=BankImportProfileRead,
)
def upsert_bank_import_profile(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    payload: BankImportProfileUpsert,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> BankImportProfileRead:
    try:
        config = BankImportProfileConfig.model_validate(payload.model_dump())
        return import_profile_service.upsert_import_profile(
            session, entity_id, money_account_id, config
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except statement_service.NotBankAccountError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@accounts_router.post(
    "/{money_account_id}/statements",
    response_model=BankStatementRead,
    status_code=201,
)
async def import_bank_statement(
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    file: UploadFile = File(...),
    profile: str | None = Form(default=None),
    save_profile: bool = Form(default=False),
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> BankStatementRead:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    profile_config = _parse_profile_form(profile)

    try:
        return statement_service.import_bank_statement(
            session,
            entity_id,
            money_account_id,
            content,
            original_filename=file.filename or "statement.csv",
            content_type=file.content_type,
            profile_config=profile_config,
            save_profile=save_profile,
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


@statements_router.get(
    "/needs-review",
    response_model=PaginatedListOut[NeedsReviewStatementLineRead],
)
def list_needs_review_statement_lines(
    entity_id: uuid.UUID,
    session: Session = Depends(get_session),
    _: None = Depends(member_read_guard),
    list_params: ListParams = Depends(list_params_dependency),
) -> PaginatedListOut[NeedsReviewStatementLineRead]:
    try:
        items, total = statement_service.list_needs_review_statement_lines(
            session,
            entity_id,
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


@statements_router.post(
    "/{statement_id}/lines/{line_id}/create-supplier",
    response_model=CreateSupplierFromLineResult,
    status_code=201,
)
def create_supplier_from_statement_line(
    entity_id: uuid.UUID,
    statement_id: uuid.UUID,
    line_id: uuid.UUID,
    payload: CreateSupplierFromLineRequest,
    session: Session = Depends(get_session),
    _: None = Depends(operations_write_guard),
) -> CreateSupplierFromLineResult:
    try:
        return statement_service.create_supplier_from_statement_line(
            session,
            entity_id,
            statement_id,
            line_id,
            name=payload.name,
            vkn=payload.vkn,
            match_token=payload.match_token,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except statement_service.LineAlreadyResolvedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except statement_service.InvalidClassificationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DuplicateSupplierError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
