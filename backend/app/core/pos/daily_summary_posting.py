"""POS daily-summary confirm posting — card batch + cash in atomically (Decisions §9)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.cash.guards import resolve_session_for_movement
from app.core.cash.posting import build_cash_in_posting_lines
from app.core.chart_of_accounts.default_chart import (
    CARD_SALES_CLEARING_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
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
    CashMovement,
    CashMovementDirection,
)
from app.features.entities import service as entity_service
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
    card_tip_journal_entry: JournalEntry | None = None


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
    z_report_kurus: int | None = None,
    period_unlock_reason: str | None = None,
    commit: bool = True,
) -> PosDailySummaryPostResult:
    """Post card sales batch + cash in for a confirmed daily summary — one transaction.

    Sales are always posted **gross** from the system slip (cash + card). When a Z
    report was reconciled upstream, ``z_report_kurus`` is stored on the summary for
    audit only — tips are recorded on the expense list, not here.
    """
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
        cash_revenue = cash_kurus
        card_revenue = card_kurus

        card_batch: CardSalesBatch | None = None
        card_journal: JournalEntry | None = None
        cash_movement: CashMovement | None = None
        cash_journal: JournalEntry | None = None

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
                period_unlock_reason=period_unlock_reason,
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
            session_id = resolve_session_for_movement(
                session,
                entity_id,
                money_account_id=money_account_id,
                session_date=sales_date,
                actor_id=actor_id,
                unlock_reason=period_unlock_reason,
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
                period_unlock_reason=period_unlock_reason,
            )
            cash_movement = CashMovement(
                session_id=session_id,
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

        summary.status = PosDailySummaryStatus.POSTED
        summary.confirmed_cash_kurus = cash_kurus
        summary.confirmed_card_kurus = card_kurus
        if z_report_kurus is not None:
            summary.z_report_kurus = z_report_kurus
        summary.money_account_id = money_account_id
        summary.confirmed_at = utcnow()
        summary.confirmed_by = actor_id
        summary.posted_at = utcnow()
        summary.posted_by = actor_id
        summary.card_sales_batch_id = card_batch.id if card_batch else None
        summary.cash_movement_id = cash_movement.id if cash_movement else None
        summary.review_reason = None

        if commit:
            session.commit()
        else:
            session.flush()
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
            card_tip_journal_entry=None,
        )
