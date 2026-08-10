"""Correcting and voiding a hand-recorded expense.

Lifted verbatim from `correction.py` when it was split.

These are `ExpenseEntry` rows — what was typed in or read off a receipt.
Salaries, supplier invoices and delivery commission also land on expense
accounts, but through their own flows and their own subledgers; the expense
register is the report that shows all of them together.
"""

from __future__ import annotations

from app.core.expenses.posting import build_expense_entry_lines
from app.core.ledger.correction.machinery import SubledgerCorrectionResult, SubledgerVoidResult, correct_gl_with_subledger_rows, void_gl_with_subledger_rows
from app.core.ledger.correction.registry import CorrectionNotFoundError
from app.core.ledger.models import JournalEntry
from app.db.session import entity_context, require_entity_context
from app.features.expenses.models import ExpenseEntry
from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session
import uuid


def correct_expense_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    expense_date: date,
    amount_kurus: int,
    expense_account_id: uuid.UUID,
    money_account_id: uuid.UUID,
    description: str,
    actor_id: uuid.UUID,
    written_item_description: str | None = None,
    expense_item_id: uuid.UUID | None = None,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerCorrectionResult:
    from app.features.banking.models import MoneyAccount

    with entity_context(session, entity_id):
        require_entity_context()
        expense = session.scalar(
            select(ExpenseEntry).where(ExpenseEntry.journal_entry_id == journal_entry_id)
        )
        if expense is None:
            raise CorrectionNotFoundError("expense entry not found for journal entry")

        money_account = session.get(MoneyAccount, money_account_id)
        if money_account is None:
            raise LookupError("money account not found")

        lines = build_expense_entry_lines(
            expense_account_id=expense_account_id,
            payment_gl_account_id=money_account.gl_account_id,
            amount_kurus=amount_kurus,
        )

        def update_expense(sess: Session, corrected: JournalEntry) -> None:
            expense.expense_date = expense_date
            expense.amount_kurus = amount_kurus
            expense.expense_account_id = expense_account_id
            expense.money_account_id = money_account_id
            expense.description = description
            expense.written_item_description = written_item_description
            expense.expense_item_id = expense_item_id
            expense.actor_id = actor_id
            expense.journal_entry_id = corrected.id
            sess.flush()

    return correct_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        expense_date,
        description,
        lines,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
        update_mutable=update_expense,
    )


def void_expense_entry(
    session: Session,
    entity_id: uuid.UUID,
    journal_entry_id: uuid.UUID,
    *,
    actor_id: uuid.UUID,
    reason: str | None = None,
    void_date: date | None = None,
    period_unlock_reason: str | None = None,
) -> SubledgerVoidResult:
    return void_gl_with_subledger_rows(
        session,
        entity_id,
        journal_entry_id,
        actor_id=actor_id,
        reason=reason,
        void_date=void_date,
        period_unlock_reason=period_unlock_reason,
    )
