"""Bank reconciliation — books vs imported lines, and vs the bank's own balance."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineStatus,
)
from app.features.reports import bank_reconciliation

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
    return {"entity_id": restaurant_a.id, "bank": bank}


def _import(db_session, entity_id, bank, rows):
    csv = "transaction_date,amount,description,reference\n" + "".join(
        f'{d},"{a}",{desc},REF-{i}\n' for i, (d, a, desc) in enumerate(rows)
    )
    return statement_service.import_bank_statement(
        db_session, entity_id, bank.id, csv.encode(), original_filename="s.csv"
    )


def _account(report, bank_id):
    return next(a for a in report.accounts if a.money_account_id == bank_id)


def test_unclassified_lines_are_what_stands_between_books_and_bank(
    db_session, setup
):
    """Nothing posted yet, so every imported line is still outstanding."""
    entity_id, bank = setup["entity_id"], setup["bank"]
    _import(
        db_session,
        entity_id,
        bank,
        [
            ("2026-06-02", "-820,00", "POS KOMISYONU"),
            ("2026-06-04", "-4.300,00", "GIDEN FAST METRO"),
        ],
    )

    report = bank_reconciliation.get_bank_reconciliation(db_session, entity_id)
    account = _account(report, bank.id)

    assert account.unreconciled_count == 2
    assert account.unreconciled_total_kurus == -512_000
    assert account.is_reconciled is False
    assert len(account.lines) == 2


def test_account_is_reconciled_once_every_line_is_settled(db_session, setup):
    entity_id, bank = setup["entity_id"], setup["bank"]
    statement = _import(
        db_session, entity_id, bank, [("2026-06-02", "-820,00", "POS KOMISYONU")]
    )

    with entity_context(db_session, entity_id):
        line = db_session.scalars(
            select(BankStatementLine).where(
                BankStatementLine.statement_id == statement.id
            )
        ).first()
        line.status = StatementLineStatus.POSTED
        db_session.commit()

    report = bank_reconciliation.get_bank_reconciliation(db_session, entity_id)
    account = _account(report, bank.id)
    assert account.unreconciled_count == 0
    assert account.is_reconciled is True


def test_stated_balance_reveals_lines_missing_from_the_import(db_session, setup):
    """Books and file can agree while both are wrong — this is what catches it."""
    entity_id, bank = setup["entity_id"], setup["bank"]
    statement = _import(
        db_session, entity_id, bank, [("2026-06-02", "-820,00", "POS KOMISYONU")]
    )

    # The bank says the account is 1.000,00 lower than books + pending explain.
    statement_service.set_statement_closing_balance(
        db_session, entity_id, statement.id, -182_000
    )

    report = bank_reconciliation.get_bank_reconciliation(db_session, entity_id)
    account = _account(report, bank.id)

    assert account.stated_closing_balance_kurus == -182_000
    # book (0) + pending (−82.000) = −82.000; bank says −182.000 → 100.000 missing.
    assert account.missing_from_import_kurus == -100_000
    assert account.is_reconciled is False


def test_no_stated_balance_leaves_missing_unknown_not_zero(db_session, setup):
    entity_id, bank = setup["entity_id"], setup["bank"]
    _import(db_session, entity_id, bank, [("2026-06-02", "-820,00", "KOMISYON")])

    report = bank_reconciliation.get_bank_reconciliation(db_session, entity_id)
    account = _account(report, bank.id)
    assert account.stated_closing_balance_kurus is None
    assert account.missing_from_import_kurus is None


def test_can_scope_to_one_account_and_unknown_id_404s(db_session, setup):
    entity_id, bank = setup["entity_id"], setup["bank"]
    _import(db_session, entity_id, bank, [("2026-06-02", "-820,00", "KOMISYON")])

    scoped = bank_reconciliation.get_bank_reconciliation(
        db_session, entity_id, money_account_id=bank.id
    )
    assert len(scoped.accounts) == 1

    with pytest.raises(LookupError):
        bank_reconciliation.get_bank_reconciliation(
            db_session, entity_id, money_account_id=uuid.uuid4()
        )


def test_cash_drawers_are_not_bank_reconciled(db_session, setup):
    """Cash is proved by counting, not by a statement — it belongs elsewhere."""
    entity_id = setup["entity_id"]
    banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )

    report = bank_reconciliation.get_bank_reconciliation(db_session, entity_id)
    assert all(a.account_kind != "cash" for a in report.accounts)
