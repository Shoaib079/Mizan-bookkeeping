"""Expense register — every expense posting in one chronological list.

Expenses are recorded from many flows: manual expenses, staff salaries and
extra days, supplier invoices, bank fees and card commission, delivery
commission, partner-fronted spend, FX spend. Each lands in its own feature page,
so there was no single place to scan a month and spot something missed or
double-recorded. This reads the ledger itself — every line posted to an EXPENSE
account — so anything that hit the books shows up here regardless of which
screen recorded it.

Uses the same effective-entry rules as the P&L (posted only, reversals
excluded), so the register's total ties to the P&L expense total for the range.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import (
    JournalEntry,
    JournalEntryLine,
    JournalEntryStatus,
)
from app.db.session import entity_context, require_entity_context
from app.features.entities import service as entity_service
from app.features.reports.schema import (
    ExpenseRegisterAccountTotal,
    ExpenseRegisterRead,
    ExpenseRegisterRow,
)
from app.features.reports.service import InvalidDateRangeError

__all__ = ["get_expense_register"]


def get_expense_register(
    session: Session,
    entity_id: uuid.UUID,
    from_date: date,
    to_date: date,
    *,
    account_id: uuid.UUID | None = None,
    q: str | None = None,
) -> ExpenseRegisterRead:
    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")
    if to_date < from_date:
        raise InvalidDateRangeError("to_date must not be before from_date")

    with entity_context(session, entity_id):
        require_entity_context()

        filters = [
            Account.account_type == AccountType.EXPENSE,
            JournalEntry.status == JournalEntryStatus.POSTED.value,
            # Reversals cancel their original; counting both would double up.
            JournalEntry.reverses_entry_id.is_(None),
            JournalEntry.entry_date >= from_date,
            JournalEntry.entry_date <= to_date,
        ]
        if account_id is not None:
            filters.append(Account.id == account_id)
        if q:
            filters.append(JournalEntry.description.ilike(f"%{q.strip()}%"))

        records = session.execute(
            select(
                JournalEntry.entry_date,
                JournalEntry.description,
                JournalEntry.source,
                JournalEntry.id,
                Account.id,
                Account.code,
                Account.name_tr,
                Account.name_en,
                JournalEntryLine.amount_kurus,
                JournalEntryLine.side,
            )
            .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
            .join(Account, Account.id == JournalEntryLine.account_id)
            .where(*filters)
            .order_by(JournalEntry.entry_date, JournalEntry.id)
        ).all()

    rows: list[ExpenseRegisterRow] = []
    totals: dict[uuid.UUID, ExpenseRegisterAccountTotal] = {}
    total_kurus = 0

    for (
        entry_date,
        description,
        source,
        journal_entry_id,
        acct_id,
        acct_code,
        acct_name_tr,
        acct_name_en,
        amount_kurus,
        side,
    ) in records:
        # Turkish name first, matching the account pickers elsewhere.
        acct_name = acct_name_tr or acct_name_en
        # Expenses are debit-normal; a credit to an expense account is a refund
        # or allocation out, so it reduces the register.
        signed = (
            amount_kurus if side == AccountNormalBalance.DEBIT else -amount_kurus
        )
        rows.append(
            ExpenseRegisterRow(
                entry_date=entry_date,
                account_id=acct_id,
                account_code=acct_code,
                account_name=acct_name,
                description=description,
                source=source,
                amount_kurus=signed,
                journal_entry_id=journal_entry_id,
            )
        )
        total_kurus += signed
        bucket = totals.get(acct_id)
        if bucket is None:
            totals[acct_id] = ExpenseRegisterAccountTotal(
                account_id=acct_id,
                account_code=acct_code,
                account_name=acct_name,
                amount_kurus=signed,
                entry_count=1,
            )
        else:
            totals[acct_id] = bucket.model_copy(
                update={
                    "amount_kurus": bucket.amount_kurus + signed,
                    "entry_count": bucket.entry_count + 1,
                }
            )

    return ExpenseRegisterRead(
        from_date=from_date,
        to_date=to_date,
        rows=rows,
        account_totals=sorted(totals.values(), key=lambda t: t.account_code),
        total_kurus=total_kurus,
        entry_count=len(rows),
    )
