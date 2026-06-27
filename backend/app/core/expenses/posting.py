"""Daily expense GL posting — Dr expense / Cr bank or cash (Decisions §7)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from app.core.chart_of_accounts.default_chart import TIPS_EXPENSE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError, PostingLine, prepare_journal_entry
from app.db.session import entity_context, require_entity_context
from app.features.banking.models import MoneyAccount, MoneyAccountKind
from app.features.entities import service as entity_service
from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus


class InvalidExpensePostingError(ValueError):
    """Expense posting preconditions failed."""


@dataclass(frozen=True, slots=True)
class ExpenseEntryPostResult:
    journal_entry: JournalEntry
    expense_entry: ExpenseEntry


def build_expense_entry_lines(
    *,
    expense_account_id: uuid.UUID,
    payment_gl_account_id: uuid.UUID,
    amount_kurus: int,
) -> list[PostingLine]:
    """GL pattern: debit expense, credit bank or cash."""
    if amount_kurus <= 0:
        raise ValueError("expense amount must be positive kuruş")

    return [
        PostingLine(
            account_id=expense_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.DEBIT,
        ),
        PostingLine(
            account_id=payment_gl_account_id,
            amount_kurus=amount_kurus,
            side=AccountNormalBalance.CREDIT,
        ),
    ]


def _validate_expense_account(
    session: Session, entity_id: uuid.UUID, account_id: uuid.UUID
) -> Account:
    account = session.get(Account, account_id)
    if account is None or account.entity_id != entity_id:
        raise InvalidAccountError("expense account not found for this entity")
    if not account.is_active:
        raise InvalidAccountError(f"account {account.code} is not active")
    if account.account_type != AccountType.EXPENSE:
        raise InvalidAccountError(f"account {account.code} is not an expense account")
    return account


def _validate_money_account(
    session: Session, entity_id: uuid.UUID, money_account_id: uuid.UUID
) -> MoneyAccount:
    money_account = session.get(MoneyAccount, money_account_id)
    if money_account is None or money_account.entity_id != entity_id:
        raise InvalidExpensePostingError("money account not found for this entity")
    if not money_account.is_active:
        raise InvalidExpensePostingError("money account is not active")
    if money_account.account_kind not in (MoneyAccountKind.BANK, MoneyAccountKind.CASH):
        raise InvalidExpensePostingError("money account must be bank or cash")
    return money_account


def _validate_tips_expense_cash_only(
    expense_account: Account, money_account: MoneyAccount
) -> None:
    if expense_account.code == TIPS_EXPENSE_CODE and money_account.account_kind != MoneyAccountKind.CASH:
        raise InvalidExpensePostingError(
            "tips expense must be paid from a cash account"
        )


def post_expense_entry(
    session: Session,
    entity_id: uuid.UUID,
    *,
    expense_date: date,
    amount_kurus: int,
    expense_account_id: uuid.UUID,
    money_account_id: uuid.UUID,
    description: str,
    actor_id: uuid.UUID,
    written_item_description: str | None = None,
    expense_item_id: uuid.UUID | None = None,
    has_source_document: bool = False,
    notes: str | None = None,
    bank_statement_line_id: uuid.UUID | None = None,
    existing_expense_entry: ExpenseEntry | None = None,
    period_unlock_reason: str | None = None,
    commit: bool = True,
) -> ExpenseEntryPostResult:
    """Post daily expense — Dr expense / Cr bank or cash GL."""
    if amount_kurus <= 0:
        raise ValueError("amount_kurus must be positive")

    if entity_service.get_entity(session, entity_id) is None:
        raise LookupError("Entity not found")

    with entity_context(session, entity_id):
        require_entity_context()

        expense_gl = _validate_expense_account(session, entity_id, expense_account_id)
        money_account = _validate_money_account(session, entity_id, money_account_id)
        _validate_tips_expense_cash_only(expense_gl, money_account)

        lines = build_expense_entry_lines(
            expense_account_id=expense_gl.id,
            payment_gl_account_id=money_account.gl_account_id,
            amount_kurus=amount_kurus,
        )

        journal_entry = prepare_journal_entry(
            session,
            entity_id,
            expense_date,
            description,
            lines,
            actor_id=actor_id,
            source=JournalEntrySource.EXPENSE_ENTRY,
            period_unlock_reason=period_unlock_reason,
        )

        if existing_expense_entry is not None:
            entry = existing_expense_entry
            entry.expense_date = expense_date
            entry.amount_kurus = amount_kurus
            entry.expense_account_id = expense_account_id
            entry.money_account_id = money_account_id
            entry.written_item_description = written_item_description
            entry.expense_item_id = expense_item_id
            entry.has_source_document = has_source_document
            entry.description = description
            entry.notes = notes
            entry.actor_id = actor_id
            entry.journal_entry_id = journal_entry.id
            entry.bank_statement_line_id = bank_statement_line_id
            entry.status = ExpenseEntryStatus.POSTED
            entry.review_reason = None
            entry.candidate_expense_item_id = None
        else:
            entry = ExpenseEntry(
                expense_date=expense_date,
                amount_kurus=amount_kurus,
                expense_account_id=expense_account_id,
                money_account_id=money_account_id,
                written_item_description=written_item_description,
                expense_item_id=expense_item_id,
                status=ExpenseEntryStatus.POSTED,
                has_source_document=has_source_document,
                description=description,
                notes=notes,
                actor_id=actor_id,
                journal_entry_id=journal_entry.id,
                bank_statement_line_id=bank_statement_line_id,
            )
            session.add(entry)

        if commit:
            session.commit()
            session.refresh(journal_entry)
            session.refresh(entry)
            _ = list(journal_entry.lines)
        else:
            session.flush()
            session.refresh(journal_entry)
            session.refresh(entry)

        return ExpenseEntryPostResult(journal_entry=journal_entry, expense_entry=entry)
