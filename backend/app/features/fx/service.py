"""FX purchase service — thin wrapper over posting boundary (Decisions §15)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.fx import ledger as fx_ledger
from app.core.fx.posting import post_fx_purchase
from app.features.banking import service as banking_service
from app.features.fx.schema import (
    FxBalanceRead,
    FxLedgerEntryRead,
    FxPurchaseCreate,
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


def get_fx_ledger(
    session: Session,
    entity_id: uuid.UUID,
    fx_money_account_id: uuid.UUID,
) -> list[FxLedgerEntryRead]:
    entries = fx_ledger.list_fx_ledger_entries(session, entity_id, fx_money_account_id)
    return [_to_ledger_read(entry) for entry in entries]


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
