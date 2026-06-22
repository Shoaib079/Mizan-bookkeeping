"""FX spend — conversion to TRY and direct expense (Decisions §15)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import FX_GAIN_CODE, FX_LOSS_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.fx.average_cost import compute_spend_at_average_cost
from app.core.fx.ledger import record_fx_movement
from app.core.fx.models import FxLedgerEntry
from app.core.fx.posting import _validate_fx_money_account
from app.core.fx.types import FxMovementType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.entities import service as entity_service


class InvalidFxSpendError(ValueError):
    """FX spend or conversion preconditions failed."""


@dataclass(frozen=True, slots=True)
class FxConversionPostResult:
    journal_entry: JournalEntry
    fx_ledger_entry: FxLedgerEntry
    try_cost_kurus: int
    realized_gain_kurus: int


@dataclass(frozen=True, slots=True)
class FxExpenseSpendPostResult:
    journal_entry: JournalEntry
    fx_ledger_entry: FxLedgerEntry
    try_cost_kurus: int


def _validate_try_asset_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> tuple[MoneyAccount, Account]:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidFxSpendError("TRY money account not found for this entity")
    if not money_account.is_active:
        raise InvalidFxSpendError("TRY money account is not active")
    if money_account.account_kind not in (MoneyAccountKind.CASH, MoneyAccountKind.BANK):
        raise InvalidFxSpendError("TRY receipt account must be bank or cash")

    gl_account = session.get(Account, money_account.gl_account_id)
    if gl_account is None or not gl_account.is_active:
        raise InvalidAccountError("TRY asset GL account not found or inactive")
    if gl_account.account_type != AccountType.ASSET:
        raise InvalidAccountError("TRY receipt account must be an asset")

    return money_account, gl_account


def _validate_expense_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("expense account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.EXPENSE:
        raise InvalidAccountError(f"account {account.code} is not an expense account")
    return account


def _chart_account(session: Session, code: str) -> Account:
    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidAccountError(f"chart account {code} not found")
    return account


def build_fx_conversion_posting_lines(
    *,
    try_asset_gl_account_id: uuid.UUID,
    fx_gl_account_id: uuid.UUID,
    fx_gain_account_id: uuid.UUID,
    fx_loss_account_id: uuid.UUID,
    try_received_kurus: int,
    try_cost_kurus: int,
) -> list[PostingLine]:
    """Dr bank/cash (TRY received) / Cr FX at average cost / realized gain or loss."""
    if try_received_kurus <= 0:
        raise ValueError("try_received_kurus must be positive")
    if try_cost_kurus <= 0:
        raise ValueError("try_cost_kurus must be positive")

    lines = [
        PostingLine(
            account_id=try_asset_gl_account_id,
            amount_kurus=try_received_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=fx_gl_account_id,
            amount_kurus=try_cost_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]

    realized = try_received_kurus - try_cost_kurus
    if realized > 0:
        lines.append(
            PostingLine(
                account_id=fx_gain_account_id,
                amount_kurus=realized,
                side=AccountNormalBalance.CREDIT,
            )
        )
    elif realized < 0:
        lines.append(
            PostingLine(
                account_id=fx_loss_account_id,
                amount_kurus=-realized,
                side=AccountNormalBalance.DEBIT,
            )
        )

    return lines


def build_fx_expense_spend_posting_lines(
    *,
    expense_account_id: uuid.UUID,
    fx_gl_account_id: uuid.UUID,
    try_cost_kurus: int,
) -> list[PostingLine]:
    """Dr expense / Cr FX wallet at average cost — no realized gain/loss."""
    if try_cost_kurus <= 0:
        raise ValueError("try_cost_kurus must be positive")

    return [
        PostingLine(
            account_id=expense_account_id,
            amount_kurus=try_cost_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=fx_gl_account_id,
            amount_kurus=try_cost_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def post_fx_conversion(
    session: Session,
    entity_id: uuid.UUID,
    *,
    fx_money_account_id: uuid.UUID,
    try_money_account_id: uuid.UUID,
    native_quantity: int,
    try_received_kurus: int,
    conversion_date: date,
    description: str,
    actor_id: uuid.UUID,
) -> FxConversionPostResult:
    """Spend FX from wallet, receive TRY — realized gain/loss only on conversion."""
    if native_quantity <= 0:
        raise ValueError("native_quantity must be positive")
    if try_received_kurus <= 0:
        raise ValueError("try_received_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        fx_account, fx_gl = _validate_fx_money_account(session, entity_id, fx_money_account_id)
        try_asset, try_gl = _validate_try_asset_money_account(
            session, entity_id, try_money_account_id
        )
        if fx_account.id == try_asset.id:
            raise InvalidFxSpendError("FX wallet and TRY account must differ")

        try_cost_kurus = compute_spend_at_average_cost(
            session, entity_id, fx_money_account_id, native_quantity
        )
        fx_gain = _chart_account(session, FX_GAIN_CODE)
        fx_loss = _chart_account(session, FX_LOSS_CODE)

        lines = build_fx_conversion_posting_lines(
            try_asset_gl_account_id=try_gl.id,
            fx_gl_account_id=fx_gl.id,
            fx_gain_account_id=fx_gain.id,
            fx_loss_account_id=fx_loss.id,
            try_received_kurus=try_received_kurus,
            try_cost_kurus=try_cost_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            conversion_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.FX_CONVERSION,
        )

        fx_entry = record_fx_movement(
            session,
            fx_money_account_id,
            movement_date=conversion_date,
            movement_type=FxMovementType.SPEND,
            native_quantity=-native_quantity,
            try_cost_kurus=-try_cost_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(fx_entry)
        _ = list(journal_entry.lines)

        return FxConversionPostResult(
            journal_entry=journal_entry,
            fx_ledger_entry=fx_entry,
            try_cost_kurus=try_cost_kurus,
            realized_gain_kurus=try_received_kurus - try_cost_kurus,
        )


def post_fx_expense_spend(
    session: Session,
    entity_id: uuid.UUID,
    *,
    fx_money_account_id: uuid.UUID,
    expense_account_id: uuid.UUID,
    native_quantity: int,
    spend_date: date,
    description: str,
    actor_id: uuid.UUID,
) -> FxExpenseSpendPostResult:
    """Pay a business expense directly from FX wallet at average cost."""
    if native_quantity <= 0:
        raise ValueError("native_quantity must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        _fx_account, fx_gl = _validate_fx_money_account(session, entity_id, fx_money_account_id)
        expense = _validate_expense_account(session, entity_id, expense_account_id)

        try_cost_kurus = compute_spend_at_average_cost(
            session, entity_id, fx_money_account_id, native_quantity
        )

        lines = build_fx_expense_spend_posting_lines(
            expense_account_id=expense.id,
            fx_gl_account_id=fx_gl.id,
            try_cost_kurus=try_cost_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            spend_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.FX_EXPENSE_SPEND,
        )

        fx_entry = record_fx_movement(
            session,
            fx_money_account_id,
            movement_date=spend_date,
            movement_type=FxMovementType.SPEND,
            native_quantity=-native_quantity,
            try_cost_kurus=-try_cost_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(fx_entry)
        _ = list(journal_entry.lines)

        return FxExpenseSpendPostResult(
            journal_entry=journal_entry,
            fx_ledger_entry=fx_entry,
            try_cost_kurus=try_cost_kurus,
        )
