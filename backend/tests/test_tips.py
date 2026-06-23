"""Tips are an EXPENSE paid from cash, not a pass-through liability (Slice A).

Owner decision 2026-06-23 (reverses Phase 6 tips pass-through + Phase 8.6 POS
carve-out): a tip is recorded through the normal expenses pipeline as
``Dr 5700 Tips Expense / Cr cash``. There is no Tips Payable (2260) liability,
and no tip_accruals/tip_payouts subledger.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import TIPS_EXPENSE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.expenses.posting import post_expense_entry
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _setup(db_session, entity):
    seed_default_chart(db_session, entity.id)
    drawer = banking_service.create_money_account(
        db_session,
        entity.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, entity.id):
        accounts = {a.code: a for a in db_session.scalars(select(Account))}
    return drawer, accounts


def _gl_balance(db_session, entity_id, account_id, normal: AccountNormalBalance) -> int:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.account_id == account_id)
            .group_by(JournalEntryLine.side)
        ).all()
        debits = credits = 0
        for side, total in rows:
            if side == AccountNormalBalance.DEBIT:
                debits = int(total or 0)
            else:
                credits = int(total or 0)
        if normal == AccountNormalBalance.CREDIT:
            return credits - debits
        return debits - credits


def test_tips_expense_account_in_default_chart_not_payable(db_session, restaurant_a) -> None:
    _, accounts = _setup(db_session, restaurant_a)

    assert "2260" not in accounts  # Tips Payable retired
    tips_expense = accounts[TIPS_EXPENSE_CODE]
    assert tips_expense.account_type == AccountType.EXPENSE
    assert tips_expense.normal_balance == AccountNormalBalance.DEBIT
    assert tips_expense.name_en == "Tips Expense"


def test_tip_posts_dr_5700_cr_cash(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    tips_expense_id = accounts[TIPS_EXPENSE_CODE].id
    drawer_id = drawer.id
    drawer_gl_id = drawer.gl_account_id

    result = post_expense_entry(
        db_session,
        restaurant_a.id,
        expense_date=date(2026, 6, 23),
        amount_kurus=4_500,
        expense_account_id=tips_expense_id,
        money_account_id=drawer_id,
        description="Tip paid to staff",
        actor_id=ACTOR_ID,
        written_item_description="Bahşiş",
    )

    assert result.journal_entry.source == JournalEntrySource.EXPENSE_ENTRY
    journal_entry_id = result.journal_entry.id

    with entity_context(db_session, restaurant_a.id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == journal_entry_id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[tips_expense_id].side == AccountNormalBalance.DEBIT
    assert by_account[tips_expense_id].amount_kurus == 4_500
    assert by_account[drawer_gl_id].side == AccountNormalBalance.CREDIT
    assert by_account[drawer_gl_id].amount_kurus == 4_500

    assert _gl_balance(
        db_session, restaurant_a.id, tips_expense_id, AccountNormalBalance.DEBIT
    ) == 4_500
    assert _gl_balance(
        db_session, restaurant_a.id, drawer_gl_id, AccountNormalBalance.DEBIT
    ) == -4_500
