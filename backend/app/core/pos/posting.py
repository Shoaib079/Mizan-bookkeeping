"""POS settlement GL posting — Dr bank / Cr card clearing (Decisions §13)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import CARD_SALES_CLEARING_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.entities import service as entity_service
from app.features.pos.models import PosSettlement


class InvalidPosSettlementError(ValueError):
    """POS settlement preconditions failed."""


@dataclass(frozen=True, slots=True)
class PosSettlementPostResult:
    journal_entry: JournalEntry
    pos_settlement: PosSettlement


def build_pos_settlement_posting_lines(
    *,
    bank_gl_account_id: uuid.UUID,
    clearing_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit bank, credit card sales clearing."""
    if amount_kurus <= 0:
        raise ValueError("settlement amount must be positive kuruş")

    return [
        PostingLine(
            account_id=bank_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=clearing_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _validate_bank_gl_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("GL account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.ASSET:
        raise InvalidAccountError(
            f"account {account.code} is not an asset (bank/cash) account"
        )
    return account


def _validate_bank_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> MoneyAccount:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidPosSettlementError("Money account not found for this entity")
    if not money_account.is_active:
        raise InvalidPosSettlementError("Money account is not active")
    if money_account.account_kind != MoneyAccountKind.BANK:
        raise InvalidPosSettlementError("POS settlement requires a bank money account")
    return money_account


def persist_pos_settlement(
    session: Session,
    *,
    money_account_id: uuid.UUID,
    settlement_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    bank_statement_line_id: uuid.UUID | None = None,
) -> PosSettlement:
    """Persist settlement row without commit — caller must hold entity_context."""
    if amount_kurus <= 0:
        raise ValueError("settlement amount_kurus must be positive")

    settlement = PosSettlement(
        money_account_id=money_account_id,
        settlement_date=settlement_date,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=actor_id,
        journal_entry_id=journal_entry_id,
        reference_type=reference_type,
        reference_id=reference_id,
        bank_statement_line_id=bank_statement_line_id,
    )
    session.add(settlement)
    session.flush()
    session.refresh(settlement)
    return settlement


def post_pos_settlement(
    session: Session,
    entity_id: uuid.UUID,
    *,
    money_account_id: uuid.UUID,
    settlement_date: date,
    amount_kurus: int,
    description: str,
    actor_id: uuid.UUID,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    bank_statement_line_id: uuid.UUID | None = None,
) -> PosSettlementPostResult:
    """Post card settlement deposit to GL and persist PosSettlement in one transaction."""
    if amount_kurus <= 0:
        raise ValueError("Settlement amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        money_account = _validate_bank_money_account(session, entity_id, money_account_id)
        _validate_bank_gl_account(session, entity_id, money_account.gl_account_id)

        clearing_account = session.scalar(
            select(Account).where(Account.code == CARD_SALES_CLEARING_CODE)
        )
        if clearing_account is None:
            raise InvalidAccountError(
                f"card sales clearing account {CARD_SALES_CLEARING_CODE} not found"
            )

        lines = build_pos_settlement_posting_lines(
            bank_gl_account_id=money_account.gl_account_id,
            clearing_account_id=clearing_account.id,
            amount_kurus=amount_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            settlement_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.POS_SETTLEMENT,
        )

        settlement = persist_pos_settlement(
            session,
            money_account_id=money_account_id,
            settlement_date=settlement_date,
            amount_kurus=amount_kurus,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
            reference_type=reference_type,
            reference_id=reference_id,
            bank_statement_line_id=bank_statement_line_id,
        )

        session.commit()
        session.refresh(journal_entry)
        session.refresh(settlement)
        _ = list(journal_entry.lines)

        return PosSettlementPostResult(
            journal_entry=journal_entry,
            pos_settlement=settlement,
        )
