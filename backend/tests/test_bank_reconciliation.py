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


def test_book_balance_uses_latest_statement_period_end(db_session, setup) -> None:
    """Post-period GL activity must not skew comparison to a July closing."""
    from app.core.expenses.posting import post_expense_entry
    from app.core.chart_of_accounts.models import Account

    entity_id, bank = setup["entity_id"], setup["bank"]
    statement = _import(
        db_session,
        entity_id,
        bank,
        [("2026-07-15", "-1.000,00", "Bank fee")],
    )

    with entity_context(db_session, entity_id):
        line = db_session.scalars(
            select(BankStatementLine).where(
                BankStatementLine.statement_id == statement.id
            )
        ).first()
        assert line is not None
        line.status = StatementLineStatus.POSTED
        expense_account = db_session.scalar(
            select(Account).where(Account.code == "5000")
        )
        assert expense_account is not None
        expense_account_id = expense_account.id
        post_expense_entry(
            db_session,
            entity_id,
            expense_date=date(2026, 7, 15),
            amount_kurus=100_000,
            expense_account_id=expense_account_id,
            money_account_id=bank.id,
            description="Bank fee",
            actor_id=ACTOR_ID,
            bank_statement_line_id=line.id,
        )
        db_session.commit()

    post_expense_entry(
        db_session,
        entity_id,
        expense_date=date(2026, 8, 1),
        amount_kurus=50_000,
        expense_account_id=expense_account_id,
        money_account_id=bank.id,
        description="August expense",
        actor_id=ACTOR_ID,
    )

    statement_service.set_statement_closing_balance(
        db_session, entity_id, statement.id, -100_000
    )

    report = bank_reconciliation.get_bank_reconciliation(db_session, entity_id)
    account = _account(report, bank.id)

    assert account.book_balance_as_of == date(2026, 7, 15)
    assert account.book_balance_kurus == -100_000
    assert account.missing_from_import_kurus == 0
    assert account.is_reconciled is True


def test_stated_closing_uses_book_chain_when_bakiye_is_wrong(db_session, setup) -> None:
    """Raw Bakiye can disagree with posted lines; reconciliation follows the books."""
    from app.adapters.bank_parsers.profile_mapper import BankImportProfileConfig
    from app.features.banking.statement_models import StatementLineClassification
    from app.core.chart_of_accounts.models import Account

    entity_id, bank = setup["entity_id"], setup["bank"]
    profile = BankImportProfileConfig(
        header_row=1,
        data_start_row=2,
        date_col=0,
        description_col=1,
        reference_col=2,
        debit_col=3,
        credit_col=4,
        balance_col=5,
        date_format="DD.MM.YYYY",
        decimal_format="tr",
        debit_is_outflow=True,
    )
    june_csv = (
        "Tarih,Aciklama,Referans,Borc,Alacak,Bakiye\n"
        "30.06.2026,Haziran kapanis,REF-JUN,,\"100.000,00\",\"100.000,00\"\n"
    )
    june = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        june_csv.encode(),
        original_filename="june.csv",
        profile_config=profile,
    )

    with entity_context(db_session, entity_id):
        june_line = db_session.scalars(
            select(BankStatementLine).where(
                BankStatementLine.statement_id == june.id
            )
        ).first()
        income_account = db_session.scalar(
            select(Account).where(Account.code == "4000")
        )
        expense_account = db_session.scalar(
            select(Account).where(Account.code == "5000")
        )
    assert june_line is not None
    assert income_account is not None
    assert expense_account is not None
    income_account_id = income_account.id
    expense_account_id = expense_account.id
    statement_service.classify_statement_line(
        db_session,
        entity_id,
        june.id,
        june_line.id,
        classification=StatementLineClassification.OTHER_INCOME,
        income_account_id=income_account_id,
        actor_id=ACTOR_ID,
    )

    july_csv = (
        "Tarih,Aciklama,Referans,Borc,Alacak,Bakiye\n"
        "31.07.2026,SGK ODEMESI,REF-SGK,\"33.410,15\",,\"152.060,81\"\n"
    )
    july = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        july_csv.encode(),
        original_filename="july.csv",
        profile_config=profile,
    )
    statement_service.set_statement_closing_balance(
        db_session, entity_id, july.id, 15_206_081
    )

    with entity_context(db_session, entity_id):
        line = db_session.scalars(
            select(BankStatementLine).where(
                BankStatementLine.statement_id == july.id
            )
        ).first()
    assert line is not None
    statement_service.classify_statement_line(
        db_session,
        entity_id,
        july.id,
        line.id,
        classification=StatementLineClassification.RENT_UTILITY,
        expense_account_id=expense_account_id,
        actor_id=ACTOR_ID,
    )

    report = bank_reconciliation.get_bank_reconciliation(db_session, entity_id)
    account = _account(report, bank.id)

    assert account.stated_closing_balance_kurus == 66_589_85
    assert account.book_balance_kurus == 66_589_85
    assert account.missing_from_import_kurus == 0
    assert account.is_reconciled is True
