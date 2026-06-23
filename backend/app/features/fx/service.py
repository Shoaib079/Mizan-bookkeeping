"""FX purchase service — thin wrapper over posting boundary (Decisions §15)."""

from __future__ import annotations

import uuid
from datetime import date

from app.core.fx.models import FxLedgerEntry
from app.core.ledger.correction import CorrectionNotFoundError, correct_fx_purchase
from app.db.session import entity_context
from sqlalchemy import select

from app.core.listing import ListParams

from app.core.fx import ledger as fx_ledger
from app.core.fx.posting import post_fx_purchase
from app.core.fx.spend_posting import InvalidFxSpendError, post_fx_conversion, post_fx_expense_spend
from app.features.banking import service as banking_service
from app.features.fx.schema import (
    FxBalanceRead,
    FxConversionCreate,
    FxConversionResponse,
    FxExpenseSpendCreate,
    FxExpenseSpendResponse,
    FxLedgerEntryRead,
    FxPurchaseCreate,
    FxPurchaseCorrect,
    FxPurchaseCorrectOut,
    FxPurchaseResponse,
)


def _to_ledger_read(entry) -> FxLedgerEntryRead:
    return FxLedgerEntryRead.model_validate(entry)


def create_fx_purchase(
    session: Session,
    entity_id: uuid.UUID,
    payload: FxPurchaseCreate,
) -> FxPurchaseResponse:
    result = post_fx_purchase(
        session,
        entity_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_cash_money_account_id=payload.try_cash_money_account_id,
        native_quantity=payload.native_quantity,
        try_cost_kurus=payload.try_cost_kurus,
        purchase_date=payload.purchase_date,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return FxPurchaseResponse(
        journal_entry_id=result.journal_entry.id,
        fx_ledger_entry=_to_ledger_read(result.fx_ledger_entry),
    )


def correct_fx_purchase_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    payload: FxPurchaseCorrect,
) -> FxPurchaseCorrectOut:
    result = correct_fx_purchase(
        session,
        entity_id,
        journal_entry_id,
        purchase_date=payload.purchase_date,
        native_quantity=payload.native_quantity,
        try_cost_kurus=payload.try_cost_kurus,
        description=payload.description,
        actor_id=payload.actor_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_cash_money_account_id=payload.try_cash_money_account_id,
        reason=payload.reason,
        void_date=payload.void_date,
    )
    with entity_context(session, entity_id):
        new_row = session.scalar(
            select(FxLedgerEntry).where(
                FxLedgerEntry.journal_entry_id == result.corrected.id
            )
        )
    if new_row is None:
        raise CorrectionNotFoundError("corrected FX ledger entry not found")
    return FxPurchaseCorrectOut(
        original_journal_entry_id=result.original.id,
        reversal_journal_entry_id=result.reversal.id,
        corrected_journal_entry_id=result.corrected.id,
        fx_ledger_entry=_to_ledger_read(new_row),
    )


def create_fx_conversion(
    session: Session,
    entity_id: uuid.UUID,
    payload: FxConversionCreate,
) -> FxConversionResponse:
    result = post_fx_conversion(
        session,
        entity_id,
        fx_money_account_id=payload.fx_money_account_id,
        try_money_account_id=payload.try_money_account_id,
        native_quantity=payload.native_quantity,
        try_received_kurus=payload.try_received_kurus,
        conversion_date=payload.conversion_date,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return FxConversionResponse(
        journal_entry_id=result.journal_entry.id,
        fx_ledger_entry=_to_ledger_read(result.fx_ledger_entry),
        try_cost_kurus=result.try_cost_kurus,
        realized_gain_kurus=result.realized_gain_kurus,
    )


def create_fx_expense_spend(
    session: Session,
    entity_id: uuid.UUID,
    payload: FxExpenseSpendCreate,
) -> FxExpenseSpendResponse:
    result = post_fx_expense_spend(
        session,
        entity_id,
        fx_money_account_id=payload.fx_money_account_id,
        expense_account_id=payload.expense_account_id,
        native_quantity=payload.native_quantity,
        spend_date=payload.spend_date,
        description=payload.description,
        actor_id=payload.actor_id,
    )
    return FxExpenseSpendResponse(
        journal_entry_id=result.journal_entry.id,
        fx_ledger_entry=_to_ledger_read(result.fx_ledger_entry),
        try_cost_kurus=result.try_cost_kurus,
    )


def get_fx_ledger(
    session: Session,
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    min_amount: int | None = None,
    max_amount: int | None = None,
    q: str | None = None,
    list_params: ListParams | None = None,
) -> tuple[list[FxLedgerEntryRead], int]:
    entries, total = fx_ledger.list_fx_ledger_entries(
        session,
        entity_id,
        fx_money_account_id,
        from_date=from_date,
        to_date=to_date,
        min_amount=min_amount,
        max_amount=max_amount,
        q=q,
        list_params=list_params,
    )
    return [_to_ledger_read(entry) for entry in entries], total


def get_fx_balance(
    session: Session,
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
) -> FxBalanceRead:
    account = banking_service.get_money_account(session, entity_id, fx_money_account_id)
    if account.currency is None:
        raise LookupError("FX money account not found")

    native_quantity = fx_ledger.native_quantity_balance(
        session, entity_id, fx_money_account_id
    )
    try_cost = fx_ledger.try_cost_balance_kurus(session, entity_id, fx_money_account_id)

    return FxBalanceRead(
        fx_money_account_id=fx_money_account_id,
        currency=account.currency,
        native_quantity=native_quantity,
        try_cost_kurus=try_cost,
        gl_balance_kurus=account.balance_kurus,
    )
