"""Bank account activity timeline — inflows/outflows from statement lines."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.adapters.bank_parsers.profile_mapper import BankImportProfileConfig
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.onboarding.posting import post_opening_balances
from app.features.banking import bank_activity
from app.features.banking import statements as statement_service
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.db.session import entity_context
from app.features.banking.statement_models import BankStatementLine, StatementLineStatus
from app.features.onboarding.opening_balances import OpeningBalanceLineInput

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
GO_LIVE = date(2026, 1, 1)

SIMPLE_PROFILE = BankImportProfileConfig(
    header_row=1,
    data_start_row=2,
    date_col=0,
    description_col=1,
    debit_col=2,
    credit_col=3,
    date_format="DD.MM.YYYY",
    decimal_format="tr",
    csv_delimiter=";",
    debit_is_outflow=True,
)

CSV = (
    "Tarih;Aciklama;Borc;Alacak\n"
    "10.06.2026;NET SATIS;;\"5.000,00\"\n"
    "11.06.2026;Supplier;\"1.200,00\";\n"
)


@pytest.fixture
def setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Is Bank",
            bank_name="Is Bank",
        ),
    )
    return {"entity_id": restaurant_a.id, "bank": bank}


def test_activity_totals_from_statement_lines(db_session, setup) -> None:
    entity_id, bank = setup["entity_id"], setup["bank"]
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        CSV.encode(),
        original_filename="jun.csv",
        profile_config=SIMPLE_PROFILE,
    )

    with entity_context(db_session, entity_id):
        lines = list(
            db_session.scalars(
                select(BankStatementLine).where(
                    BankStatementLine.statement_id == statement.id
                )
            )
        )
        for line in lines:
            line.status = StatementLineStatus.POSTED
        db_session.commit()

    report = bank_activity.get_bank_account_activity(
        db_session,
        entity_id,
        bank.id,
        from_date=date(2026, 6, 1),
        to_date=date(2026, 6, 30),
    )

    assert report.total_in_kurus == 500_000
    assert report.total_out_kurus == 120_000
    assert report.net_flow_kurus == 380_000
    assert report.posted_in_kurus == 500_000
    assert report.posted_out_kurus == 120_000
    assert len(report.rows) == 4  # opening + 2 lines + closing
    assert report.rows[1].movement_label == "Unclassified"
    assert report.rows[1].amount_kurus == 500_000


def test_unposted_lines_count_in_statement_totals_not_posted(db_session, setup) -> None:
    entity_id, bank = setup["entity_id"], setup["bank"]
    statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        CSV.encode(),
        original_filename="jun-unposted.csv",
        profile_config=SIMPLE_PROFILE,
    )

    report = bank_activity.get_bank_account_activity(
        db_session,
        entity_id,
        bank.id,
        from_date=date(2026, 6, 1),
        to_date=date(2026, 6, 30),
    )

    assert report.total_in_kurus == 500_000
    assert report.posted_in_kurus == 0
    assert report.rows[1].affects_balance is False


def test_opening_balance_before_period_included_in_opening_not_timeline(
    db_session, setup
) -> None:
    entity_id, bank = setup["entity_id"], setup["bank"]
    post_opening_balances(
        db_session,
        entity_id,
        go_live_date=GO_LIVE,
        lines=[OpeningBalanceLineInput(money_account_id=bank.id, amount_kurus=750_000)],
        actor_id=ACTOR_ID,
    )

    report = bank_activity.get_bank_account_activity(
        db_session,
        entity_id,
        bank.id,
        from_date=date(2026, 6, 1),
        to_date=date(2026, 6, 30),
    )

    assert report.opening_balance_kurus == 750_000
    assert report.closing_balance_kurus == 750_000
    assert report.posted_in_kurus == 0
    assert not any(row.movement_kind == "opening_balance" for row in report.rows)


def test_opening_balance_in_period_shows_row_and_running_balance(
    db_session, setup
) -> None:
    entity_id, bank = setup["entity_id"], setup["bank"]
    post_opening_balances(
        db_session,
        entity_id,
        go_live_date=date(2026, 6, 1),
        lines=[OpeningBalanceLineInput(money_account_id=bank.id, amount_kurus=500_000)],
        actor_id=ACTOR_ID,
    )

    report = bank_activity.get_bank_account_activity(
        db_session,
        entity_id,
        bank.id,
        from_date=date(2026, 6, 1),
        to_date=date(2026, 6, 30),
    )

    ob_rows = [row for row in report.rows if row.movement_kind == "opening_balance"]
    assert len(ob_rows) == 1
    assert ob_rows[0].amount_kurus == 500_000
    assert ob_rows[0].balance_kurus == 500_000
    assert report.posted_in_kurus == 500_000
    assert report.closing_balance_kurus == 500_000
    assert report.rows[-1].balance_kurus == report.closing_balance_kurus
    assert report.rows[0].balance_kurus == 0
