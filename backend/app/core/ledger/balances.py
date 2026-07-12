"""Signed GL balances from posted journal lines — period activity and as-of (Phase 7)."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntryStatus

__all__ = [
    "balance_as_of_kurus",
    "debit_credit_activity_kurus",
    "net_cash_effect_on_accounts",
    "period_activity_kurus",
]


def _debit_credit_totals_kurus(
    session: Session,
    account_id,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    as_of_date: date | None = None,
) -> tuple[int, int]:
    query = (
        select(
            JournalEntryLine.side,
            func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0),
        )
        .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
        .where(
            JournalEntryLine.account_id == account_id,
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            JournalEntry.reverses_entry_id.is_(None),
        )
        .group_by(JournalEntryLine.side)
    )
    if from_date is not None:
        query = query.where(JournalEntry.entry_date >= from_date)
    if to_date is not None:
        query = query.where(JournalEntry.entry_date <= to_date)
    if as_of_date is not None:
        query = query.where(JournalEntry.entry_date <= as_of_date)

    debits = credits = 0
    for side, total in session.execute(query).all():
        if side == AccountNormalBalance.DEBIT:
            debits = int(total)
        else:
            credits = int(total)
    return debits, credits


def _signed_balance_kurus(
    debits: int, credits: int, normal_balance: AccountNormalBalance
) -> int:
    if normal_balance == AccountNormalBalance.DEBIT:
        return debits - credits
    return credits - debits


def period_activity_kurus(
    session: Session,
    account: Account,
    from_date: date,
    to_date: date,
) -> int:
    """Natural signed activity for one account within an inclusive date range."""
    debits, credits = _debit_credit_totals_kurus(
        session,
        account.id,
        from_date=from_date,
        to_date=to_date,
    )
    return _signed_balance_kurus(debits, credits, account.normal_balance)


def debit_credit_activity_kurus(
    session: Session,
    account_id,
    from_date: date,
    to_date: date,
) -> tuple[int, int]:
    """Raw (debits, credits) posted to an account within an inclusive range.

    Unlike ``period_activity_kurus`` (which nets to a signed balance), this keeps
    the two sides separate so a clearing roll-forward can show card sales (debits
    into 1400) and deposits/sweeps (credits out of 1400) as distinct lines.
    """
    return _debit_credit_totals_kurus(
        session, account_id, from_date=from_date, to_date=to_date
    )


def balance_as_of_kurus(
    session: Session,
    account: Account,
    as_of_date: date,
) -> int:
    """Natural signed cumulative balance through as_of_date inclusive."""
    debits, credits = _debit_credit_totals_kurus(
        session,
        account.id,
        as_of_date=as_of_date,
    )
    return _signed_balance_kurus(debits, credits, account.normal_balance)


def net_cash_effect_on_accounts(
    session: Session,
    journal_entry_id: uuid.UUID,
    account_ids: set[uuid.UUID],
) -> int:
    """Signed net cash effect on liquid GL lines in one entry (debit +, credit −)."""
    if not account_ids:
        return 0

    query = (
        select(
            JournalEntryLine.side,
            func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0),
        )
        .where(
            JournalEntryLine.journal_entry_id == journal_entry_id,
            JournalEntryLine.account_id.in_(account_ids),
        )
        .group_by(JournalEntryLine.side)
    )
    debits = credits = 0
    for side, total in session.execute(query).all():
        if side == AccountNormalBalance.DEBIT:
            debits = int(total)
        else:
            credits = int(total)
    return debits - credits
