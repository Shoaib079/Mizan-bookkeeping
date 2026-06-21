"""Cash drawer GL posting — movements and EOD over/short (Decisions §14)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import CASH_OVER_SHORT_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.base import utcnow
from app.db.session import entity_context, require_entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.cash.models import (
    CashDrawerSession,
    CashDrawerSessionStatus,
    CashMovement,
    CashMovementDirection,
)
from app.features.entities import service as entity_service


class InvalidCashDrawerError(ValueError):
    """Cash drawer preconditions failed."""


@dataclass(frozen=True, slots=True)
class CashMovementPostResult:
    journal_entry: JournalEntry
    cash_movement: CashMovement
    session: CashDrawerSession


@dataclass(frozen=True, slots=True)
class CashDrawerCloseResult:
    session: CashDrawerSession
    close_journal_entry: JournalEntry | None


def build_cash_in_posting_lines(
    *,
    cash_gl_account_id: uuid.UUID,
    offset_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit cash, credit offset account."""
    if amount_kurus <= 0:
        raise ValueError("cash movement amount must be positive kuruş")

    return [
        PostingLine(
            account_id=cash_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=offset_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_cash_out_posting_lines(
    *,
    cash_gl_account_id: uuid.UUID,
    offset_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit offset account, credit cash."""
    if amount_kurus <= 0:
        raise ValueError("cash movement amount must be positive kuruş")

    return [
        PostingLine(
            account_id=offset_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=cash_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_cash_over_posting_lines(
    *,
    cash_gl_account_id: uuid.UUID,
    over_short_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern for drawer overage: debit cash, credit cash over/short."""
    if amount_kurus <= 0:
        raise ValueError("over amount must be positive kuruş")

    return [
        PostingLine(
            account_id=cash_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=over_short_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_cash_short_posting_lines(
    *,
    cash_gl_account_id: uuid.UUID,
    over_short_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern for drawer shortage: debit cash over/short, credit cash."""
    if amount_kurus <= 0:
        raise ValueError("short amount must be positive kuruş")

    return [
        PostingLine(
            account_id=over_short_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=cash_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _get_account_by_code(session: Session, code: str) -> Account:
    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidCashDrawerError(f"account {code} not found — seed chart first")
    return account


def _validate_cash_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> MoneyAccount:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidCashDrawerError("cash money account not found for this entity")
    if not money_account.is_active:
        raise InvalidCashDrawerError("cash money account is not active")
    if money_account.account_kind != MoneyAccountKind.CASH:
        raise InvalidCashDrawerError("money account must be a cash drawer account")
    return money_account


def _validate_offset_account(
    session: Session,
    entity_id: uuid.UUID,
    offset_account_id: uuid.UUID,
    *,
    cash_gl_account_id: uuid.UUID,
) -> Account:
    account = session.get(Account, offset_account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("offset account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.id == cash_gl_account_id:
        raise InvalidCashDrawerError(
            "offset account cannot be the same cash GL account — use transfers for own-account moves"
        )
    return account


def _get_or_create_open_session(
    session: Session,
    *,
    money_account_id: uuid.UUID,
    session_date: date,
) -> CashDrawerSession:
    drawer_session = session.scalar(
        select(CashDrawerSession).where(
            CashDrawerSession.money_account_id == money_account_id,
            CashDrawerSession.session_date == session_date,
        )
    )
    if drawer_session is not None:
        if drawer_session.status == CashDrawerSessionStatus.CLOSED:
            raise InvalidCashDrawerError("drawer day is closed — no further movements allowed")
        return drawer_session

    drawer_session = CashDrawerSession(
        money_account_id=money_account_id,
        session_date=session_date,
        status=CashDrawerSessionStatus.OPEN,
    )
    session.add(drawer_session)
    session.flush()
    session.refresh(drawer_session)
    return drawer_session


def post_cash_movement(
    session: Session,
    entity_id: uuid.UUID,
    *,
    money_account_id: uuid.UUID,
    movement_date: date,
    direction: CashMovementDirection,
    amount_kurus: int,
    offset_account_id: uuid.UUID,
    description: str,
    actor_id: uuid.UUID,
) -> CashMovementPostResult:
    """Post cash in/out to GL and persist movement in one transaction."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        money_account = _validate_cash_money_account(session, entity_id, money_account_id)
        offset_account = _validate_offset_account(
            session,
            entity_id,
            offset_account_id,
            cash_gl_account_id=money_account.gl_account_id,
        )
        drawer_session = _get_or_create_open_session(
            session,
            money_account_id=money_account_id,
            session_date=movement_date,
        )

        if direction == CashMovementDirection.IN:
            lines = build_cash_in_posting_lines(
                cash_gl_account_id=money_account.gl_account_id,
                offset_account_id=offset_account.id,
                amount_kurus=amount_kurus,
            )
        else:
            lines = build_cash_out_posting_lines(
                cash_gl_account_id=money_account.gl_account_id,
                offset_account_id=offset_account.id,
                amount_kurus=amount_kurus,
            )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            movement_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.CASH_MOVEMENT,
        )

        movement = CashMovement(
            session_id=drawer_session.id,
            money_account_id=money_account_id,
            movement_date=movement_date,
            direction=direction,
            amount_kurus=amount_kurus,
            offset_account_id=offset_account.id,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )
        session.add(movement)
        session.commit()
        session.refresh(journal_entry)
        session.refresh(movement)
        session.refresh(drawer_session)
        _ = list(journal_entry.lines)

        return CashMovementPostResult(
            journal_entry=journal_entry,
            cash_movement=movement,
            session=drawer_session,
        )


def close_cash_drawer_session(
    session: Session,
    entity_id: uuid.UUID,
    *,
    session_id: uuid.UUID,
    counted_balance_kurus: int,
    actor_id: uuid.UUID,
    description: str = "Cash drawer EOD close",
) -> CashDrawerCloseResult:
    """Close drawer day — post over/short if needed and lock the session."""
    if counted_balance_kurus < 0:
        raise ValueError("counted balance cannot be negative")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        drawer_session = session.get(CashDrawerSession, session_id)
        if drawer_session is None:
            raise LookupError("Cash drawer session not found")
        if drawer_session.status == CashDrawerSessionStatus.CLOSED:
            raise InvalidCashDrawerError("drawer session is already closed")

        money_account = _validate_cash_money_account(
            session, entity_id, drawer_session.money_account_id
        )

        expected_balance_kurus = banking_service.gl_balance_kurus(
            session,
            money_account.gl_account_id,
            AccountNormalBalance.DEBIT,
        )
        over_short_kurus = counted_balance_kurus - expected_balance_kurus

        close_journal_entry: JournalEntry | None = None
        if over_short_kurus != 0:
            over_short_account = _get_account_by_code(session, CASH_OVER_SHORT_CODE)
            if over_short_kurus > 0:
                lines = build_cash_over_posting_lines(
                    cash_gl_account_id=money_account.gl_account_id,
                    over_short_account_id=over_short_account.id,
                    amount_kurus=over_short_kurus,
                )
                close_description = f"{description} — over {over_short_kurus} kuruş"
            else:
                lines = build_cash_short_posting_lines(
                    cash_gl_account_id=money_account.gl_account_id,
                    over_short_account_id=over_short_account.id,
                    amount_kurus=abs(over_short_kurus),
                )
                close_description = f"{description} — short {abs(over_short_kurus)} kuruş"

            close_journal_entry = prepare_journal_entry(
                session,
                entity_id,
                drawer_session.session_date,
                close_description,
                lines,
                actor_id=actor_id,
                source=JournalEntrySource.CASH_DRAWER_CLOSE,
            )

        drawer_session.expected_balance_kurus = expected_balance_kurus
        drawer_session.counted_balance_kurus = counted_balance_kurus
        drawer_session.over_short_kurus = over_short_kurus
        drawer_session.status = CashDrawerSessionStatus.CLOSED
        drawer_session.closed_at = utcnow()
        drawer_session.closed_by = actor_id
        drawer_session.close_journal_entry_id = (
            close_journal_entry.id if close_journal_entry is not None else None
        )

        session.commit()
        session.refresh(drawer_session)
        if close_journal_entry is not None:
            session.refresh(close_journal_entry)
            _ = list(close_journal_entry.lines)

        return CashDrawerCloseResult(
            session=drawer_session,
            close_journal_entry=close_journal_entry,
        )
