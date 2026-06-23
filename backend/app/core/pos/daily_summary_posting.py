"""POS daily-summary confirm posting — card batch + cash in atomically (Decisions §9)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.cash.posting import (
    InvalidCashDrawerError,
    build_cash_in_posting_lines,
)
from app.core.chart_of_accounts.default_chart import (
    CARD_SALES_CLEARING_CODE,
    SALES_REVENUE_CODE,
    TIPS_PAYABLE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, prepare_journal_entry
from app.core.pos.posting import (
    build_card_sales_batch_posting_lines,
    persist_card_sales_batch,
)
from app.db.base import utcnow
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.cash.models import (
    CashDrawerSession,
    CashDrawerSessionStatus,
    CashMovement,
    CashMovementDirection,
)
from app.core.tips.posting import (
    build_card_tip_accrual_lines,
    build_cash_tip_accrual_lines,
)
from app.features.entities import service as entity_service
from app.features.tips.models import TipAccrual, TipAccrualSource
from app.features.pos.models import CardSalesBatch, PosDailySummary, PosDailySummaryStatus


class PosDailySummaryPostError(ValueError):
    """POS daily-summary posting preconditions failed."""


@dataclass(frozen=True, slots=True)
class PosDailySummaryPostResult:
    summary: PosDailySummary
    card_sales_batch: CardSalesBatch | None
    cash_movement: CashMovement | None
    card_journal_entry: JournalEntry | None
    cash_journal_entry: JournalEntry | None
    tip_journal_entry: JournalEntry | None = None


def _tip_split(
    *,
    cash_kurus: int,
    card_kurus: int,
    total_kurus: int,
    tips_kurus: int,
) -> tuple[int, int]:
    if total_kurus == 0 or tips_kurus == 0:
        return 0, 0
    card_tips = (tips_kurus * card_kurus) // total_kurus
    return card_tips, tips_kurus - card_tips


def _accrue_pos_tips(
    session: Session,
    entity_id: uuid.UUID,
    *,
    sales_date: date,
    card_tips_kurus: int,
    cash_tips_kurus: int,
    money_account: MoneyAccount,
    description: str,
    actor_id: uuid.UUID,
) -> JournalEntry | None:
    if card_tips_kurus <= 0 and cash_tips_kurus <= 0:
        return None

    tips_payable = _get_account_by_code(session, TIPS_PAYABLE_CODE)
    last_journal: JournalEntry | None = None

    if card_tips_kurus > 0:
        clearing = _get_account_by_code(session, CARD_SALES_CLEARING_CODE)
        card_lines = build_card_tip_accrual_lines(
            card_clearing_id=clearing.id,
            tips_payable_id=tips_payable.id,
            amount_kurus=card_tips_kurus,
        )
        last_journal = prepare_journal_entry(
            session,
            entity_id,
            sales_date,
            f"{description} — card",
            card_lines,
            actor_id=actor_id,
            source=JournalEntrySource.TIP_ACCRUAL,
        )
        session.add(
            TipAccrual(
                accrual_date=sales_date,
                amount_kurus=card_tips_kurus,
                source=TipAccrualSource.CARD,
                money_account_id=None,
                description=description,
                actor_id=actor_id,
                journal_entry_id=last_journal.id,
            )
        )
        session.flush()

    if cash_tips_kurus > 0:
        cash_lines = build_cash_tip_accrual_lines(
            cash_gl_account_id=money_account.gl_account_id,
            tips_payable_id=tips_payable.id,
            amount_kurus=cash_tips_kurus,
        )
        last_journal = prepare_journal_entry(
            session,
            entity_id,
            sales_date,
            f"{description} — cash",
            cash_lines,
            actor_id=actor_id,
            source=JournalEntrySource.TIP_ACCRUAL,
        )
        session.add(
            TipAccrual(
                accrual_date=sales_date,
                amount_kurus=cash_tips_kurus,
                source=TipAccrualSource.CASH,
                money_account_id=money_account.id,
                description=description,
                actor_id=actor_id,
                journal_entry_id=last_journal.id,
            )
        )
        session.flush()

    return last_journal


def _revenue_amounts(
    *,
    cash_kurus: int,
    card_kurus: int,
    total_kurus: int,
    tips_kurus: int,
) -> tuple[int, int, int]:
    """Return (cash_revenue, card_revenue, tips_kurus) for GL posting."""
    if tips_kurus < 0:
        raise PosDailySummaryPostError("tips_kurus must be >= 0")
    if tips_kurus > total_kurus:
        raise PosDailySummaryPostError("tips cannot exceed total")
    revenue_total = total_kurus - tips_kurus
    if total_kurus == 0:
        return 0, 0, tips_kurus
    cash_revenue = (revenue_total * cash_kurus) // total_kurus
    card_revenue = revenue_total - cash_revenue
    return cash_revenue, card_revenue, tips_kurus


def _get_account_by_code(session: Session, code: str) -> Account:
    account = session.scalar(select(Account).where(Account.code == code))
    if account is None:
        raise InvalidAccountError(f"account {code} not found")
    return account


def _validate_cash_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> MoneyAccount:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise PosDailySummaryPostError("cash money account not found for this entity")
    if not money_account.is_active:
        raise PosDailySummaryPostError("cash money account is not active")
    if money_account.account_kind != MoneyAccountKind.CASH:
        raise PosDailySummaryPostError(
            "POS daily summary cash portion requires a cash drawer account"
        )
    return money_account


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
            raise InvalidCashDrawerError(
                "drawer day is closed — no further movements allowed"
            )
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


def confirm_pos_daily_summary(
    session: Session,
    entity_id: uuid.UUID,
    summary: PosDailySummary,
    *,
    money_account_id: uuid.UUID,
    cash_kurus: int,
    card_kurus: int,
    actor_id: uuid.UUID,
    description: str,
) -> PosDailySummaryPostResult:
    """Post card sales batch + cash in for a confirmed daily summary — one transaction."""
    if cash_kurus < 0 or card_kurus < 0:
        raise PosDailySummaryPostError("cash and card amounts must be >= 0")
    if cash_kurus == 0 and card_kurus == 0:
        raise PosDailySummaryPostError("at least one of cash or card must be positive")
    if cash_kurus + card_kurus != summary.total_kurus:
        raise PosDailySummaryPostError(
            "cash + card must equal total before posting — correct amounts or reject"
        )

    status = PosDailySummaryStatus(summary.status)
    if status not in {
        PosDailySummaryStatus.DRAFT,
        PosDailySummaryStatus.NEEDS_REVIEW,
        PosDailySummaryStatus.CONFIRMED,
    }:
        raise PosDailySummaryPostError(
            f"summary status {status.value!r} cannot be posted"
        )

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    sales_date = summary.summary_date or date.today()

    with entity_context(session, entity_id):
        require_entity_context()

        money_account = _validate_cash_money_account(session, entity_id, money_account_id)
        sales_revenue_account = _get_account_by_code(session, SALES_REVENUE_CODE)
        tips_kurus = summary.tips_kurus or 0
        cash_revenue, card_revenue, tips_kurus = _revenue_amounts(
            cash_kurus=cash_kurus,
            card_kurus=card_kurus,
            total_kurus=summary.total_kurus,
            tips_kurus=tips_kurus,
        )

        card_batch: CardSalesBatch | None = None
        card_journal: JournalEntry | None = None
        cash_movement: CashMovement | None = None
        cash_journal: JournalEntry | None = None
        tip_journal: JournalEntry | None = None

        if card_kurus > 0:
            clearing_account = _get_account_by_code(session, CARD_SALES_CLEARING_CODE)
            card_lines = build_card_sales_batch_posting_lines(
                clearing_account_id=clearing_account.id,
                sales_revenue_account_id=sales_revenue_account.id,
                gross_amount_kurus=card_revenue,
            )
            card_journal = prepare_journal_entry(
                session,
                entity_id,
                sales_date,
                f"{description} — card",
                card_lines,
                actor_id=actor_id,
                source=JournalEntrySource.CARD_SALES,
            )
            card_batch = persist_card_sales_batch(
                session,
                sales_date=sales_date,
                gross_amount_kurus=card_kurus,
                description=f"{description} — card",
                actor_id=actor_id,
                journal_entry_id=card_journal.id,
            )

        if cash_kurus > 0:
            drawer_session = _get_or_create_open_session(
                session,
                money_account_id=money_account_id,
                session_date=sales_date,
            )
            cash_lines = build_cash_in_posting_lines(
                cash_gl_account_id=money_account.gl_account_id,
                offset_account_id=sales_revenue_account.id,
                amount_kurus=cash_revenue,
            )
            cash_journal = prepare_journal_entry(
                session,
                entity_id,
                sales_date,
                f"{description} — cash",
                cash_lines,
                actor_id=actor_id,
                source=JournalEntrySource.CASH_MOVEMENT,
            )
            cash_movement = CashMovement(
                session_id=drawer_session.id,
                money_account_id=money_account_id,
                movement_date=sales_date,
                direction=CashMovementDirection.IN,
                amount_kurus=cash_kurus,
                offset_account_id=sales_revenue_account.id,
                description=f"{description} — cash",
                actor_id=actor_id,
                journal_entry_id=cash_journal.id,
            )
            session.add(cash_movement)
            session.flush()

        if tips_kurus > 0:
            card_tips, cash_tips = _tip_split(
                cash_kurus=cash_kurus,
                card_kurus=card_kurus,
                total_kurus=summary.total_kurus,
                tips_kurus=tips_kurus,
            )
            tip_journal = _accrue_pos_tips(
                session,
                entity_id,
                sales_date=sales_date,
                card_tips_kurus=card_tips,
                cash_tips_kurus=cash_tips,
                money_account=money_account,
                description=f"{description} — tips",
                actor_id=actor_id,
            )

        summary.status = PosDailySummaryStatus.POSTED
        summary.confirmed_cash_kurus = cash_kurus
        summary.confirmed_card_kurus = card_kurus
        summary.money_account_id = money_account_id
        summary.confirmed_at = utcnow()
        summary.confirmed_by = actor_id
        summary.posted_at = utcnow()
        summary.posted_by = actor_id
        summary.card_sales_batch_id = card_batch.id if card_batch else None
        summary.cash_movement_id = cash_movement.id if cash_movement else None
        summary.review_reason = None

        session.commit()
        session.refresh(summary)
        if card_batch is not None:
            session.refresh(card_batch)
            _ = list(card_journal.lines)  # type: ignore[union-attr]
        if cash_movement is not None:
            session.refresh(cash_movement)
            _ = list(cash_journal.lines)  # type: ignore[union-attr]

        return PosDailySummaryPostResult(
            summary=summary,
            card_sales_batch=card_batch,
            cash_movement=cash_movement,
            card_journal_entry=card_journal,
            cash_journal_entry=cash_journal,
            tip_journal_entry=tip_journal,
        )
