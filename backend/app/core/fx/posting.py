"""FX purchase GL posting + subledger (Decisions §15)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.cash.guards import resolve_session_for_movement
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx.ledger import record_fx_movement, resolve_fx_purchase_description
from app.core.fx.models import FxLedgerEntry
from app.core.fx.types import FxMovementType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import (
    FX_BUCKET_CODE_BY_CURRENCY,
    MoneyAccount,
    MoneyAccountKind,
)
from app.features.cash.models import CashMovement, CashMovementDirection
from app.features.entities import service as entity_service


class InvalidFxPurchaseError(ValueError):
    """FX purchase preconditions failed."""


@dataclass(frozen=True, slots=True)
class FxPurchasePostResult:
    journal_entry: JournalEntry
    fx_ledger_entry: FxLedgerEntry
    cash_movement: CashMovement


def build_fx_purchase_posting_lines(
    *,
    fx_gl_account_id: uuid.UUID,
    try_cash_gl_account_id: uuid.UUID,
    try_cost_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit FX cash (TRY book cost), credit TRY cash drawer."""
    if try_cost_kurus <= 0:
        raise ValueError("try_cost_kurus must be positive")

    return [
        PostingLine(
            account_id=fx_gl_account_id,
            amount_kurus=try_cost_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=try_cash_gl_account_id,
            amount_kurus=try_cost_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _validate_fx_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> tuple[MoneyAccount, Account]:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidFxPurchaseError("FX money account not found for this entity")
    if not money_account.is_active:
        raise InvalidFxPurchaseError("FX money account is not active")
    if money_account.account_kind != MoneyAccountKind.FOREIGN_CURRENCY:
        raise InvalidFxPurchaseError("money account must be a foreign currency wallet")
    if money_account.currency is None:
        raise InvalidFxPurchaseError("FX money account is missing currency")

    gl_account = session.get(Account, money_account.gl_account_id)
    if gl_account is None or not gl_account.is_active:
        raise InvalidAccountError("FX GL account not found or inactive")

    expected_bucket = FX_BUCKET_CODE_BY_CURRENCY.get(money_account.currency)
    if expected_bucket is None:
        raise InvalidFxPurchaseError(f"unsupported FX currency: {money_account.currency}")

    bucket = session.get(Account, gl_account.parent_account_id) if gl_account.parent_account_id else None
    if bucket is None or bucket.code != expected_bucket:
        raise InvalidFxPurchaseError(
            f"FX wallet must map to chart bucket {expected_bucket} for {money_account.currency}"
        )

    return money_account, gl_account


def _validate_try_cash_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> tuple[MoneyAccount, Account]:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidFxPurchaseError("TRY cash money account not found for this entity")
    if not money_account.is_active:
        raise InvalidFxPurchaseError("TRY cash money account is not active")
    if money_account.account_kind != MoneyAccountKind.CASH:
        raise InvalidFxPurchaseError("TRY payment account must be a cash drawer account")

    gl_account = session.get(Account, money_account.gl_account_id)
    if gl_account is None or not gl_account.is_active:
        raise InvalidAccountError("TRY cash GL account not found or inactive")

    return money_account, gl_account


def record_fx_purchase_cash_movement(
    session: Session,
    entity_id: uuid.UUID,
    *,
    try_cash_account: MoneyAccount,
    fx_gl_account_id: uuid.UUID,
    try_cost_kurus: int,
    movement_date: date,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    period_unlock_reason: str | None = None,
) -> CashMovement:
    """Persist drawer OUT movement tied to an FX purchase journal entry."""
    session_id = resolve_session_for_movement(
        session,
        entity_id,
        money_account_id=try_cash_account.id,
        session_date=movement_date,
        actor_id=actor_id,
        unlock_reason=period_unlock_reason,
    )
    movement = CashMovement(
        session_id=session_id,
        money_account_id=try_cash_account.id,
        movement_date=movement_date,
        direction=CashMovementDirection.OUT,
        amount_kurus=try_cost_kurus,
        offset_account_id=fx_gl_account_id,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
    )
    session.add(movement)
    session.flush()
    session.refresh(movement)
    return movement


def post_fx_purchase(
    session: Session,
    entity_id: uuid.UUID,
    *,
    fx_money_account_id: uuid.UUID,
    try_cash_money_account_id: uuid.UUID,
    native_quantity: int,
    try_cost_kurus: int,
    purchase_date: date,
    description: str | None,
    actor_id: uuid.UUID,
) -> FxPurchasePostResult:
    """Post FX purchase to GL and FX subledger in one transaction."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        fx_account, fx_gl = _validate_fx_money_account(session, entity_id, fx_money_account_id)
        try_cash_account, try_cash_gl = _validate_try_cash_money_account(
            session, entity_id, try_cash_money_account_id
        )

        if fx_account.id == try_cash_account.id:
            raise InvalidFxPurchaseError("FX wallet and TRY cash account must differ")

        ledger_description = resolve_fx_purchase_description(
            description, fx_account.currency
        )

        lines = build_fx_purchase_posting_lines(
            fx_gl_account_id=fx_gl.id,
            try_cash_gl_account_id=try_cash_gl.id,
            try_cost_kurus=try_cost_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            purchase_date,
            ledger_description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.FX_PURCHASE,
        )

        fx_entry = record_fx_movement(
            session,
            fx_account.id,
            movement_date=purchase_date,
            movement_type=FxMovementType.PURCHASE,
            native_quantity=native_quantity,
            try_cost_kurus=try_cost_kurus,
            description=ledger_description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        cash_movement = record_fx_purchase_cash_movement(
            session,
            entity_id,
            try_cash_account=try_cash_account,
            fx_gl_account_id=fx_gl.id,
            try_cost_kurus=try_cost_kurus,
            movement_date=purchase_date,
            description=ledger_description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(fx_entry)
        session.refresh(cash_movement)
        _ = list(journal_entry.lines)

        return FxPurchasePostResult(
            journal_entry=journal_entry,
            fx_ledger_entry=fx_entry,
            cash_movement=cash_movement,
        )
