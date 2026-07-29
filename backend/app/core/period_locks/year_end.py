"""Year-end close — move the year's result into Retained Earnings.

Revenue and expense accounts are *temporary*: they measure one year's trading
and should start the next year at zero. Without a closing entry they accumulate
forever, so by year three the balance sheet's "unclosed net income" line mixes
three years of results and Retained Earnings (3100) sits at zero (FINANCIAL_AUDIT F4).

That zero matters beyond presentation: **partner profit allocation already
debits 3100** to distribute profit to partners. Nothing ever credited it, so
that flow has always drawn on an empty account. This is the missing half.

The entry: debit every revenue account by its balance, credit every expense
account by its balance, and put the difference to Retained Earnings — credit
for a profit, debit for a loss. Dated 31 December, so it lands inside the year
it closes.

It is excluded from the P&L (``P_AND_L_EXCLUDED_SOURCES``) because it describes
the closing of the year rather than the year's trading; counting it would net
every closed year to nil. It is non-cash for the cash-flow statement.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import RETAINED_EARNINGS_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.balances import balance_as_of_kurus
from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.ledger.posting import PostingLine, post_journal_entry
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service

__all__ = [
    "YearEndPreview",
    "YearEndPreviewLine",
    "AlreadyClosedError",
    "NothingToCloseError",
    "preview_year_end_close",
    "post_year_end_close",
    "year_end_entry",
]


class AlreadyClosedError(ValueError):
    """This year already has a year-end entry."""


class NothingToCloseError(ValueError):
    """No revenue or expense activity to move."""


@dataclass(frozen=True)
class YearEndPreviewLine:
    account_id: uuid.UUID
    code: str
    name: str
    account_type: str
    balance_kurus: int


@dataclass
class YearEndPreview:
    year: int
    closing_date: date
    revenue_total_kurus: int = 0
    expense_total_kurus: int = 0
    lines: list[YearEndPreviewLine] = field(default_factory=list)
    already_closed: bool = False
    #: The 31 December entry, when this year has already been closed.
    journal_entry_id: uuid.UUID | None = None

    @property
    def net_result_kurus(self) -> int:
        return self.revenue_total_kurus - self.expense_total_kurus


def _closing_date(year: int) -> date:
    return date(year, 12, 31)


def year_end_entry(session: Session, year: int) -> JournalEntry | None:
    """The live year-end entry for this year, if one exists.

    Voided entries and their reversals don't count — a voided year-end close
    means the year is open again and can be re-closed.
    """
    return session.scalar(
        select(JournalEntry).where(
            JournalEntry.source == JournalEntrySource.YEAR_END_CLOSE.value,
            JournalEntry.entry_date == _closing_date(year),
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            JournalEntry.reverses_entry_id.is_(None),
        )
    )


def _temporary_accounts(session: Session) -> list[Account]:
    """Revenue and expense accounts, active or not.

    Not filtered by ``is_active``: an account deactivated mid-year can still
    hold a balance, and leaving it out would strand that balance in a P&L
    account forever.
    """
    return list(
        session.scalars(
            select(Account)
            .where(Account.account_type.in_((AccountType.REVENUE, AccountType.EXPENSE)))
            .order_by(Account.code)
        )
    )


def _build_preview(session: Session, year: int) -> YearEndPreview:
    closing_date = _closing_date(year)
    preview = YearEndPreview(year=year, closing_date=closing_date)

    existing = year_end_entry(session, year)
    if existing is not None:
        preview.already_closed = True
        preview.journal_entry_id = existing.id

    for account in _temporary_accounts(session):
        # Cumulative to 31 December, not the year's activity: if a prior year
        # was never closed, its balance is still sitting here and belongs in
        # retained earnings too.
        balance = balance_as_of_kurus(session, account, closing_date)
        if balance == 0:
            continue
        preview.lines.append(
            YearEndPreviewLine(
                account_id=account.id,
                code=account.code,
                name=account.name_en or account.name_tr,
                account_type=account.account_type.value,
                balance_kurus=balance,
            )
        )
        if account.account_type == AccountType.REVENUE:
            preview.revenue_total_kurus += balance
        else:
            preview.expense_total_kurus += balance

    return preview


def preview_year_end_close(
    session: Session, entity_id: uuid.UUID, *, year: int
) -> YearEndPreview:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    with entity_context(session, entity_id):
        require_entity_context()
        return _build_preview(session, year)


def build_year_end_lines(
    preview: YearEndPreview, retained_earnings_id: uuid.UUID
) -> list[PostingLine]:
    """Reverse every temporary balance; the difference lands in equity.

    A revenue account carries a credit balance, so it is closed by a debit of
    the same size, and vice versa for expenses. Retained Earnings takes the
    remainder, which balances the entry by construction.
    """
    lines: list[PostingLine] = []
    for line in preview.lines:
        closing_side = (
            AccountNormalBalance.DEBIT
            if line.account_type == AccountType.REVENUE.value
            else AccountNormalBalance.CREDIT
        )
        # A negative balance (e.g. a contra or over-corrected account) closes
        # the other way round; the amount posted is always positive.
        if line.balance_kurus < 0:
            closing_side = (
                AccountNormalBalance.CREDIT
                if closing_side == AccountNormalBalance.DEBIT
                else AccountNormalBalance.DEBIT
            )
        lines.append(
            PostingLine(line.account_id, abs(line.balance_kurus), closing_side)
        )

    net = preview.net_result_kurus
    if net != 0:
        # Profit increases equity (credit); a loss reduces it (debit).
        lines.append(
            PostingLine(
                retained_earnings_id,
                abs(net),
                AccountNormalBalance.CREDIT if net > 0 else AccountNormalBalance.DEBIT,
            )
        )
    return lines


def post_year_end_close(
    session: Session,
    entity_id: uuid.UUID,
    *,
    year: int,
    actor_id: uuid.UUID,
    description: str | None = None,
    period_unlock_reason: str | None = None,
) -> JournalEntry:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        preview = _build_preview(session, year)
        if preview.already_closed:
            raise AlreadyClosedError(f"{year} has already been closed")
        if not preview.lines:
            raise NothingToCloseError(
                f"no revenue or expense balances to close for {year}"
            )

        retained = session.scalar(
            select(Account).where(Account.code == RETAINED_EARNINGS_CODE)
        )
        if retained is None:
            raise LookupError(
                f"Retained Earnings ({RETAINED_EARNINGS_CODE}) is missing from the chart"
            )

        entry = post_journal_entry(
            session,
            entity_id,
            preview.closing_date,
            description or f"Year-end close {year}",
            build_year_end_lines(preview, retained.id),
            actor_id=actor_id,
            source=JournalEntrySource.YEAR_END_CLOSE,
            period_unlock_reason=period_unlock_reason,
        )
        session.commit()
        session.refresh(entry)
        _ = list(entry.lines)
        return entry
