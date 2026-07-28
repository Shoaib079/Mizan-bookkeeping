"""Cash book — one drawer as a statement, so physical cash can be matched.

Cash is touched by many flows: daily cash sales, expenses paid from the drawer,
staff salaries and advances, supplier payments, customer payments, deposits to
the bank, FX purchases, drawer over/short. The Cash page only ever listed
explicit cash-movement records, so a salary paid from the till never appeared
and there was no single answer to "how much should be in the drawer".

This reads the cash account's GL lines directly — anything that hit the books
shows up regardless of which screen recorded it — and rolls forward:

    opening + money in − money out = what should be in the drawer

The closing figure is the same GL balance the drawer close compares a physical
count against, so the book and the count can never disagree by construction.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.balances import balance_as_of_kurus
from app.core.ledger.models import (
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
)
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.cash.models import CashDrawerSession, CashDrawerSessionStatus
from app.features.entities import service as entity_service
from app.features.reports.schema import (
    CashBookLastCount,
    CashBookRead,
    CashBookRow,
    CashBookSourceTotal,
)
from app.features.reports.service import InvalidDateRangeError

__all__ = ["get_cash_book"]


class CashAccountRequiredError(ValueError):
    """The requested money account is not a cash account."""


def get_cash_book(
    session: Session,
    entity_id: uuid.UUID,
    money_account_id: uuid.UUID,
    from_date: date,
    to_date: date,
) -> CashBookRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    if to_date < from_date:
        raise InvalidDateRangeError("to_date must not be before from_date")

    with entity_context(session, entity_id):
        require_entity_context()

        money_account = session.get(MoneyAccount, money_account_id)
        if money_account is None:
            raise LookupError("Cash account not found")
        if money_account.account_kind != MoneyAccountKind.CASH:
            raise CashAccountRequiredError("money account must be a cash drawer")

        gl_account = session.get(Account, money_account.gl_account_id)
        if gl_account is None:
            raise LookupError("Cash GL account not found")

        opening_kurus = balance_as_of_kurus(
            session, gl_account, from_date - timedelta(days=1)
        )

        records = session.execute(
            select(
                JournalEntry.entry_date,
                JournalEntry.description,
                JournalEntry.source,
                JournalEntry.id,
                JournalEntryLine.amount_kurus,
                JournalEntryLine.side,
            )
            .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
            .where(
                JournalEntryLine.account_id == gl_account.id,
                JournalEntry.status == JournalEntryStatus.POSTED.value,
                JournalEntry.reverses_entry_id.is_(None),
                JournalEntry.entry_date >= from_date,
                JournalEntry.entry_date <= to_date,
            )
            .order_by(JournalEntry.entry_date, JournalEntry.id)
        ).all()

        # Closed counts, newest first. One short day is noise; the same drawer
        # short repeatedly is a pattern, so the history lives with the
        # roll-forward that explains it rather than off in Banking.
        closed_sessions = session.scalars(
            select(CashDrawerSession)
            .where(
                CashDrawerSession.money_account_id == money_account_id,
                CashDrawerSession.status == CashDrawerSessionStatus.CLOSED,
            )
            .order_by(CashDrawerSession.session_date.desc())
            .limit(60)
        ).all()
        counts = [
            CashBookLastCount(
                session_date=s.session_date,
                expected_kurus=s.expected_balance_kurus or 0,
                counted_kurus=s.counted_balance_kurus or 0,
                over_short_kurus=s.over_short_kurus or 0,
            )
            for s in closed_sessions
        ]
        last_count = counts[0] if counts else None

    rows: list[CashBookRow] = []
    totals: dict[str, CashBookSourceTotal] = {}
    running = opening_kurus
    total_in = 0
    total_out = 0

    for entry_date, description, source, journal_entry_id, amount_kurus, side in records:
        # Cash is debit-normal: a debit is money in, a credit is money out.
        is_in = side == AccountNormalBalance.DEBIT
        in_kurus = amount_kurus if is_in else 0
        out_kurus = 0 if is_in else amount_kurus
        running += in_kurus - out_kurus
        total_in += in_kurus
        total_out += out_kurus
        rows.append(
            CashBookRow(
                entry_date=entry_date,
                description=description,
                source=source,
                in_kurus=in_kurus,
                out_kurus=out_kurus,
                balance_kurus=running,
                journal_entry_id=journal_entry_id,
            )
        )
        bucket = totals.get(source)
        if bucket is None:
            totals[source] = CashBookSourceTotal(
                source=source,
                in_kurus=in_kurus,
                out_kurus=out_kurus,
                entry_count=1,
            )
        else:
            totals[source] = bucket.model_copy(
                update={
                    "in_kurus": bucket.in_kurus + in_kurus,
                    "out_kurus": bucket.out_kurus + out_kurus,
                    "entry_count": bucket.entry_count + 1,
                }
            )

    return CashBookRead(
        money_account_id=money_account_id,
        money_account_name=money_account.name,
        from_date=from_date,
        to_date=to_date,
        opening_kurus=opening_kurus,
        total_in_kurus=total_in,
        total_out_kurus=total_out,
        closing_kurus=running,
        rows=rows,
        source_totals=sorted(totals.values(), key=lambda t: t.source),
        last_count=last_count,
        counts=counts,
    )
