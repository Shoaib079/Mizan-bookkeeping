"""Link statement lines to expenses already posted from a bank or cash account."""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus


def used_expense_entry_ids(
    session: Session, *, exclude_line_id: uuid.UUID | None = None
):
    query = select(BankStatementLine.expense_entry_id).where(
        BankStatementLine.expense_entry_id.isnot(None)
    )
    if exclude_line_id is not None:
        query = query.where(BankStatementLine.id != exclude_line_id)
    return query


def find_matching_expense(
    session: Session,
    *,
    money_account_id: uuid.UUID,
    amount_kurus: int,
    transaction_date: date,
    expense_account_id: uuid.UUID,
    exclude_line_id: uuid.UUID | None = None,
) -> ExpenseEntry | None:
    """Expense posted from this account on the same date/amount, not yet tied to a line."""
    if amount_kurus >= 0:
        return None

    used_entry_ids = used_expense_entry_ids(session, exclude_line_id=exclude_line_id)
    expense_amount = abs(amount_kurus)

    return session.scalar(
        select(ExpenseEntry)
        .where(
            ExpenseEntry.money_account_id == money_account_id,
            ExpenseEntry.expense_date == transaction_date,
            ExpenseEntry.amount_kurus == expense_amount,
            ExpenseEntry.expense_account_id == expense_account_id,
            ExpenseEntry.status == ExpenseEntryStatus.POSTED,
            ExpenseEntry.bank_statement_line_id.is_(None),
            ExpenseEntry.id.not_in(used_entry_ids),
        )
        .order_by(ExpenseEntry.created_at)
        .limit(1)
    )


def link_expense_to_line(
    line: BankStatementLine,
    *,
    expense_entry: ExpenseEntry,
    classification: StatementLineClassification,
) -> None:
    line.classification = classification
    line.status = StatementLineStatus.LINKED
    line.journal_entry_id = expense_entry.journal_entry_id
    line.expense_entry_id = expense_entry.id
    line.review_reason = None
    expense_entry.bank_statement_line_id = line.id
