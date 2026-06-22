"""Tips pass-through GL posting — accrual and payout (Decisions §9)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import (
    CARD_SALES_CLEARING_CODE,
    TIPS_PAYABLE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.session import entity_context, require_entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.entities import service as entity_service
from app.features.tips.models import TipAccrual, TipAccrualSource, TipPayout


class InvalidTipsPostingError(ValueError):
    """Tips posting preconditions failed."""


@dataclass(frozen=True, slots=True)
class TipAccrualPostResult:
    journal_entry: JournalEntry
    tip_accrual: TipAccrual


@dataclass(frozen=True, slots=True)
class TipPayoutPostResult:
    journal_entry: JournalEntry
    tip_payout: TipPayout


def build_card_tip_accrual_lines(
    *,
    card_clearing_id: uuid.UUID,
    tips_payable_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit card clearing, credit tips payable."""
    if amount_kurus <= 0:
        raise ValueError("tip accrual amount must be positive kuruş")

    return [
        PostingLine(
            account_id=card_clearing_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=tips_payable_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_cash_tip_accrual_lines(
    *,
    cash_gl_account_id: uuid.UUID,
    tips_payable_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit cash, credit tips payable."""
    if amount_kurus <= 0:
        raise ValueError("tip accrual amount must be positive kuruş")

    return [
        PostingLine(
            account_id=cash_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=tips_payable_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def build_tip_payout_lines(
    *,
    tips_payable_id: uuid.UUID,
    cash_gl_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit tips payable, credit cash."""
    if amount_kurus <= 0:
        raise ValueError("tip payout amount must be positive kuruş")

    return [
        PostingLine(
            account_id=tips_payable_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=cash_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _chart_account(session: Session, code: str) -> Account:
    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidAccountError(f"chart account {code} not found")
    if not account.is_active:
        raise InvalidAccountError(f"account {code} is not active")
    return account


def _validate_cash_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> MoneyAccount:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidTipsPostingError("cash money account not found for this entity")
    if not money_account.is_active:
        raise InvalidTipsPostingError("cash money account is not active")
    if money_account.account_kind != MoneyAccountKind.CASH:
        raise InvalidTipsPostingError("money account must be a cash drawer account")
    return money_account


def _tips_payable_balance_kurus(session: Session, tips_payable_id: uuid.UUID) -> int:
    return banking_service.gl_balance_kurus(
        session,
        tips_payable_id,
        AccountNormalBalance.CREDIT,
    )


def post_tip_accrual(
    session: Session,
    entity_id: uuid.UUID,
    *,
    accrual_date: date,
    amount_kurus: int,
    source: TipAccrualSource,
    description: str,
    actor_id: uuid.UUID,
    money_account_id: uuid.UUID | None = None,
) -> TipAccrualPostResult:
    """Accrue tips — card Dr 1400 / Cr 2260; cash held Dr cash / Cr 2260."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        tips_payable = _chart_account(session, TIPS_PAYABLE_CODE)

        if source == TipAccrualSource.CARD:
            if money_account_id is not None:
                raise InvalidTipsPostingError("money_account_id not allowed for card tip accrual")
            card_clearing = _chart_account(session, CARD_SALES_CLEARING_CODE)
            lines = build_card_tip_accrual_lines(
                card_clearing_id=card_clearing.id,
                tips_payable_id=tips_payable.id,
                amount_kurus=amount_kurus,
            )
            stored_money_account_id: uuid.UUID | None = None
        else:
            if money_account_id is None:
                raise InvalidTipsPostingError("money_account_id required for cash tip accrual")
            money_account = _validate_cash_money_account(session, entity_id, money_account_id)
            lines = build_cash_tip_accrual_lines(
                cash_gl_account_id=money_account.gl_account_id,
                tips_payable_id=tips_payable.id,
                amount_kurus=amount_kurus,
            )
            stored_money_account_id = money_account_id

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            accrual_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.TIP_ACCRUAL,
        )

        tip_accrual = TipAccrual(
            accrual_date=accrual_date,
            amount_kurus=amount_kurus,
            source=source,
            money_account_id=stored_money_account_id,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )
        session.add(tip_accrual)
        session.commit()
        session.refresh(journal_entry)
        session.refresh(tip_accrual)
        _ = list(journal_entry.lines)

        return TipAccrualPostResult(journal_entry=journal_entry, tip_accrual=tip_accrual)


def post_tip_payout(
    session: Session,
    entity_id: uuid.UUID,
    *,
    payout_date: date,
    amount_kurus: int,
    money_account_id: uuid.UUID,
    description: str,
    actor_id: uuid.UUID,
) -> TipPayoutPostResult:
    """Pay tips to staff — Dr 2260 / Cr cash; reject if pot balance insufficient."""
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        tips_payable = _chart_account(session, TIPS_PAYABLE_CODE)
        balance = _tips_payable_balance_kurus(session, tips_payable.id)
        if amount_kurus > balance:
            raise InvalidTipsPostingError(
                f"payout of {amount_kurus} kuruş exceeds tips payable balance of {balance} kuruş"
            )

        money_account = _validate_cash_money_account(session, entity_id, money_account_id)
        lines = build_tip_payout_lines(
            tips_payable_id=tips_payable.id,
            cash_gl_account_id=money_account.gl_account_id,
            amount_kurus=amount_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            payout_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.TIP_PAYOUT,
        )

        tip_payout = TipPayout(
            payout_date=payout_date,
            amount_kurus=amount_kurus,
            money_account_id=money_account_id,
            description=description,
            actor_id=actor_id,
            journal_entry_id=journal_entry.id,
        )
        session.add(tip_payout)
        session.commit()
        session.refresh(journal_entry)
        session.refresh(tip_payout)
        _ = list(journal_entry.lines)

        return TipPayoutPostResult(journal_entry=journal_entry, tip_payout=tip_payout)
