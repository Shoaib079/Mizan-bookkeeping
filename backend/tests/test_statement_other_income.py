"""other_income — money in that isn't a customer or a settlement.

Outflows always had a catch-all ("Expense from bank", pick any expense
account); inflows had none, so bank interest, refunds and payouts could not be
classified at all — leaving lines stuck in review and the account permanently
unreconcilable.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import (
    SALARY_EXPENSE_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    StatementLineClassification,
    StatementLineStatus,
)

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK, name="Garanti", bank_name="Garanti"
        ),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {"entity_id": restaurant_a.id, "bank": bank, "accounts": accounts}


def _import(db_session, entity_id, bank, amount, desc="FAIZ GELIRI"):
    csv = (
        "transaction_date,amount,description,reference\n"
        f'2026-06-15,"{amount}",{desc},REF-1\n'
    ).encode()
    return statement_service.import_bank_statement(
        db_session, entity_id, bank.id, csv, original_filename="s.csv"
    )


def test_bank_interest_posts_dr_bank_cr_income(db_session, setup):
    entity_id, bank = setup["entity_id"], setup["bank"]
    revenue_id = setup["accounts"][SALES_REVENUE_CODE]
    statement = _import(db_session, entity_id, bank, "1.250,00")

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        statement.lines[0].id,
        classification=StatementLineClassification.OTHER_INCOME,
        actor_id=ACTOR_ID,
        income_account_id=revenue_id,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.journal_entry_id is not None

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry_id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[bank.gl_account_id].side == AccountNormalBalance.DEBIT
    assert by_account[bank.gl_account_id].amount_kurus == 125_000
    assert by_account[revenue_id].side == AccountNormalBalance.CREDIT
    assert by_account[revenue_id].amount_kurus == 125_000


def test_other_income_rejects_an_outflow(db_session, setup):
    entity_id, bank = setup["entity_id"], setup["bank"]
    statement = _import(db_session, entity_id, bank, "-500,00", "GIDEN")

    with pytest.raises(statement_service.InvalidClassificationError):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            statement.lines[0].id,
            classification=StatementLineClassification.OTHER_INCOME,
            actor_id=ACTOR_ID,
            income_account_id=setup["accounts"][SALES_REVENUE_CODE],
        )


def test_other_income_requires_an_income_account(db_session, setup):
    entity_id, bank = setup["entity_id"], setup["bank"]
    statement = _import(db_session, entity_id, bank, "1.250,00")

    with pytest.raises(statement_service.InvalidClassificationError):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            statement.lines[0].id,
            classification=StatementLineClassification.OTHER_INCOME,
            actor_id=ACTOR_ID,
        )


def test_correcting_a_line_to_other_income_keeps_the_income_account(
    db_session, setup
):
    """The correction path forwards to classify; dropping income_account_id
    there made every correction fail as "income_account_id is required"."""
    entity_id, bank = setup["entity_id"], setup["bank"]
    revenue_id = setup["accounts"][SALES_REVENUE_CODE]
    statement = _import(db_session, entity_id, bank, "1.250,00", "FAIZ")
    line_id = statement.lines[0].id

    statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.UNKNOWN,
        actor_id=ACTOR_ID,
    )

    result = statement_service.correct_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        actor_id=ACTOR_ID,
        classification=StatementLineClassification.OTHER_INCOME,
        income_account_id=revenue_id,
        reason="Bank interest, not unknown",
    )

    assert result.line.status == StatementLineStatus.POSTED

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry_id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[revenue_id].side == AccountNormalBalance.CREDIT
    assert by_account[bank.gl_account_id].amount_kurus == 125_000


def test_other_income_refuses_a_non_revenue_account(db_session, setup):
    """Crediting an expense would record a refund, not income."""
    entity_id, bank = setup["entity_id"], setup["bank"]
    statement = _import(db_session, entity_id, bank, "1.250,00")

    with pytest.raises(statement_service.InvalidClassificationError):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            statement.lines[0].id,
            classification=StatementLineClassification.OTHER_INCOME,
            actor_id=ACTOR_ID,
            income_account_id=setup["accounts"][SALARY_EXPENSE_CODE],
        )
