"""CRUD for saved bank import column profiles."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.bank_parsers.profile_mapper import BankImportProfileConfig
from app.adapters.bank_parsers.raw_grid import (
    grid_preview_rows,
    read_raw_grid,
    resolve_csv_read_options,
)
from app.adapters.bank_parsers.dispatch import resolve_statement_format
from app.db.session import entity_context, require_entity_context
from app.features.banking.import_profile_models import BankImportProfile
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.banking.schema import BankImportProfileRead, BankStatementPreview


def _require_bank_money_account(
    session: Session, money_account_id: uuid.UUID
) -> MoneyAccount:
    from app.features.banking.statements import NotBankAccountError

    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None:
        raise LookupError("Money account not found")
    if money_account.account_kind != MoneyAccountKind.BANK:
        raise NotBankAccountError("Bank statements can only be imported for bank accounts")
    return money_account


def profile_to_config(model: BankImportProfile) -> BankImportProfileConfig:
    return BankImportProfileConfig(
        header_row=model.header_row,
        data_start_row=model.data_start_row,
        date_col=model.date_col,
        description_col=model.description_col,
        reference_col=model.reference_col,
        amount_col=model.amount_col,
        debit_col=model.debit_col,
        credit_col=model.credit_col,
        date_format=model.date_format,  # type: ignore[arg-type]
        decimal_format=model.decimal_format,  # type: ignore[arg-type]
        debit_is_outflow=model.debit_is_outflow,
        csv_encoding=model.csv_encoding,  # type: ignore[arg-type]
        csv_delimiter=model.csv_delimiter,  # type: ignore[arg-type]
    )


def _to_read(model: BankImportProfile) -> BankImportProfileRead:
    return BankImportProfileRead(
        id=model.id,
        entity_id=model.entity_id,
        money_account_id=model.money_account_id,
        **profile_to_config(model).model_dump(),
        updated_at=model.updated_at,
    )


def get_import_profile(
    session: Session,
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
) -> BankImportProfile | None:
    with entity_context(session, entity_id):
        require_entity_context()
        _require_bank_money_account(session, money_account_id)
        return session.scalar(
            select(BankImportProfile).where(
                BankImportProfile.money_account_id == money_account_id
            )
        )


def get_import_profile_read(
    session: Session,
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
) -> BankImportProfileRead | None:
    model = get_import_profile(session, entity_id, money_account_id)
    return _to_read(model) if model is not None else None


def upsert_import_profile(
    session: Session,
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    config: BankImportProfileConfig,
) -> BankImportProfileRead:
    with entity_context(session, entity_id):
        require_entity_context()
        _require_bank_money_account(session, money_account_id)

        existing = session.scalar(
            select(BankImportProfile).where(
                BankImportProfile.money_account_id == money_account_id
            )
        )
        if existing is None:
            existing = BankImportProfile(money_account_id=money_account_id)
            session.add(existing)

        existing.header_row = config.header_row
        existing.data_start_row = config.data_start_row
        existing.date_col = config.date_col
        existing.description_col = config.description_col
        existing.reference_col = config.reference_col
        existing.amount_col = config.amount_col
        existing.debit_col = config.debit_col
        existing.credit_col = config.credit_col
        existing.date_format = config.date_format
        existing.decimal_format = config.decimal_format
        existing.debit_is_outflow = config.debit_is_outflow
        existing.csv_encoding = config.csv_encoding
        existing.csv_delimiter = config.csv_delimiter

        session.commit()
        session.refresh(existing)
        return _to_read(existing)


def preview_statement_upload(
    content: bytes,
    *,
    original_filename: str | None = None,
    content_type: str | None = None,
) -> BankStatementPreview:
    fmt = resolve_statement_format(
        original_filename=original_filename,
        content_type=content_type,
    )
    csv_encoding: str | None = None
    csv_delimiter: str | None = None
    read_encoding: str | None = None
    read_delimiter: str | None = None
    if fmt == ".csv":
        _, csv_encoding, csv_delimiter = resolve_csv_read_options(content)
        read_encoding = csv_encoding
        read_delimiter = csv_delimiter

    grid = read_raw_grid(
        content,
        original_filename=original_filename,
        content_type=content_type,
        csv_encoding=read_encoding,
        csv_delimiter=read_delimiter,
    )
    return BankStatementPreview(
        rows=grid_preview_rows(grid, limit=15),
        total_rows=len(grid),
        csv_encoding=csv_encoding,
        csv_delimiter=csv_delimiter,
    )
