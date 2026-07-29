"""Month close readiness — one blocking check, the rest advisory.

A lock applied over an unexplained bank line doesn't protect the books, it just
timestamps a wrong number. These tests pin which failures stop a close and
which only inform.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.period_locks.models import PeriodLockKind
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import StatementLineClassification
from app.features.auth import service as auth_service
from app.features.auth.schema import UserCreate
from app.features.period_locks import readiness as readiness_module
from app.features.period_locks import service as lock_service
from app.features.pos import service as pos_service
from app.features.pos.schema import CardSalesBatchCreate

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
    # period_locks.closed_by is a real FK to users.id — a fabricated actor id
    # passes the service and fails at the insert.
    owner = auth_service.create_user(
        db_session,
        UserCreate(email="month-close-owner@example.com", display_name="Owner"),
    )
    return {"entity_id": restaurant_a.id, "bank": bank, "owner_id": owner.id}


def _import(db_session, entity_id, bank, rows):
    csv = "transaction_date,amount,description,reference\n" + "".join(
        f'{d},"{a}",{desc},REF-{i}\n' for i, (d, a, desc) in enumerate(rows)
    )
    return statement_service.import_bank_statement(
        db_session, entity_id, bank.id, csv.encode(), original_filename="s.csv"
    )


def _check(result, key):
    return next(c for c in result.checks if c.key == key)


def test_month_bounds_covers_february_in_a_leap_year():
    assert readiness_module.month_bounds(2028, 2) == (
        date(2028, 2, 1),
        date(2028, 2, 29),
    )


def test_month_bounds_rejects_a_nonsense_month():
    with pytest.raises(ValueError):
        readiness_module.month_bounds(2026, 13)


def test_a_quiet_month_is_ready_to_close(db_session, setup):
    result = readiness_module.get_month_close_readiness(
        db_session, setup["entity_id"], year=2026, month=6
    )
    assert result.can_close is True
    assert _check(result, "unclassified_statement_lines").passed is True


def test_an_unclassified_line_blocks_the_close(db_session, setup):
    entity_id, bank = setup["entity_id"], setup["bank"]
    _import(db_session, entity_id, bank, [("2026-06-04", "-4.300,00", "GIDEN METRO")])

    result = readiness_module.get_month_close_readiness(
        db_session, entity_id, year=2026, month=6
    )
    check = _check(result, "unclassified_statement_lines")

    assert check.severity == readiness_module.CheckSeverity.BLOCK
    assert check.passed is False
    assert check.count == 1
    assert result.can_close is False
    assert readiness_module.blocking_failures(result) == [check]


def test_classifying_the_line_clears_the_block(db_session, setup):
    """The way through is to book it — not to override the check."""
    entity_id, bank = setup["entity_id"], setup["bank"]
    statement = _import(
        db_session, entity_id, bank, [("2026-06-02", "-820,00", "BANKA MASRAF")]
    )

    statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        statement.lines[0].id,
        classification=StatementLineClassification.BANK_FEE,
        actor_id=ACTOR_ID,
    )

    result = readiness_module.get_month_close_readiness(
        db_session, entity_id, year=2026, month=6
    )
    assert _check(result, "unclassified_statement_lines").passed is True
    assert result.can_close is True


def test_a_line_in_another_month_does_not_block_this_one(db_session, setup):
    """Scoped by the transaction's own date — an import can straddle months."""
    entity_id, bank = setup["entity_id"], setup["bank"]
    _import(db_session, entity_id, bank, [("2026-07-04", "-4.300,00", "GIDEN")])

    june = readiness_module.get_month_close_readiness(
        db_session, entity_id, year=2026, month=6
    )
    july = readiness_module.get_month_close_readiness(
        db_session, entity_id, year=2026, month=7
    )

    assert june.can_close is True
    assert july.can_close is False


def test_missing_bank_closing_balance_warns_but_never_blocks(db_session, setup):
    entity_id = setup["entity_id"]
    result = readiness_module.get_month_close_readiness(
        db_session, entity_id, year=2026, month=6
    )
    check = _check(result, "bank_balance_confirmed")

    assert check.passed is False
    assert check.severity == readiness_module.CheckSeverity.WARN
    assert result.can_close is True
    assert result.warning_count >= 1


def _card_sale(db_session, setup, sales_date: str, gross: int):
    # actor_id must be supplied when calling the service directly. The API
    # resolves it from the token (`resolve_actor_id`, which returns a UUID or
    # raises 422), so only tests can reach the schema's `None` default — and it
    # then fails at the INSERT, not at validation. `ledger_audit_events.actor_id`
    # trips first (the journal entry is written before the batch row), so the
    # error names a table you weren't thinking about.
    return pos_service.create_card_sales_batch(
        db_session,
        setup["entity_id"],
        CardSalesBatchCreate(
            sales_date=date.fromisoformat(sales_date),
            gross_amount_kurus=gross,
            description=f"Card sales {sales_date}",
            actor_id=setup["owner_id"],
        ),
    )


def test_last_weekends_card_sales_do_not_hold_the_month_open(db_session, setup):
    """Friday–Sunday sales land in the bank on Monday the 1st. That's normal.

    The residual sits in clearing on the 30th by design; flagging it would
    make every month look wrong and train the owner to ignore the check.
    """
    entity_id = setup["entity_id"]
    _card_sale(db_session, setup, "2026-06-27", 400_000)  # Saturday
    _card_sale(db_session, setup, "2026-06-28", 350_000)  # Sunday

    result = readiness_module.get_month_close_readiness(
        db_session, entity_id, year=2026, month=6
    )
    check = _check(result, "card_clearing_residual")

    assert check.passed is True
    assert check.amount_kurus == 750_000
    assert "normal" in check.detail.lower()
    assert result.can_close is True


def test_card_money_older_than_a_weekend_is_flagged(db_session, setup):
    """The 184k signature: sales sitting in clearing for weeks, never deposited."""
    entity_id = setup["entity_id"]
    _card_sale(db_session, setup, "2026-06-03", 900_000)

    result = readiness_module.get_month_close_readiness(
        db_session, entity_id, year=2026, month=6
    )
    check = _check(result, "card_clearing_residual")

    assert check.passed is False
    assert check.severity == readiness_module.CheckSeverity.WARN
    assert check.amount_kurus == 900_000
    assert "03.06.2026" in check.detail
    # Still only advisory — an old residual is a question, not a veto.
    assert result.can_close is True


def test_clearing_age_is_measured_from_month_end_not_today(db_session, setup):
    """Asked of June, the question is what was in transit on 30 June."""
    entity_id = setup["entity_id"]
    _card_sale(db_session, setup, "2026-06-29", 500_000)

    june = readiness_module.get_month_close_readiness(
        db_session, entity_id, year=2026, month=6
    )
    assert _check(june, "card_clearing_residual").passed is True


def test_a_sale_after_month_end_does_not_count_against_the_month(db_session, setup):
    entity_id = setup["entity_id"]
    _card_sale(db_session, setup, "2026-07-02", 500_000)

    june = readiness_module.get_month_close_readiness(
        db_session, entity_id, year=2026, month=6
    )
    assert _check(june, "card_clearing_residual").passed is True
    assert _check(june, "card_clearing_residual").amount_kurus is None


def test_close_is_refused_while_a_line_is_unclassified(db_session, setup):
    entity_id, bank = setup["entity_id"], setup["bank"]
    _import(db_session, entity_id, bank, [("2026-06-04", "-4.300,00", "GIDEN")])

    with pytest.raises(lock_service.MonthNotReadyError):
        lock_service.close_entity_period(
            db_session,
            entity_id,
            lock_kind=PeriodLockKind.MONTH,
            anchor_date=date(2026, 6, 30),
            actor_id=ACTOR_ID,
        )


def test_closing_a_day_is_not_gated_by_month_readiness(db_session, setup):
    """Day close is the drawer's business; month readiness must not leak into it."""
    entity_id, bank = setup["entity_id"], setup["bank"]
    _import(db_session, entity_id, bank, [("2026-06-04", "-4.300,00", "GIDEN")])

    lock = lock_service.close_entity_period(
        db_session,
        entity_id,
        lock_kind=PeriodLockKind.DAY,
        anchor_date=date(2026, 6, 4),
        actor_id=setup["owner_id"],
    )
    assert lock.period_start == date(2026, 6, 4)


def test_readiness_reports_an_existing_lock(db_session, setup):
    entity_id = setup["entity_id"]
    lock_service.close_entity_period(
        db_session,
        entity_id,
        lock_kind=PeriodLockKind.MONTH,
        anchor_date=date(2026, 6, 15),
        actor_id=setup["owner_id"],
    )

    out = lock_service.get_entity_month_close_readiness(
        db_session, entity_id, year=2026, month=6
    )
    assert out.existing_lock is not None
    assert out.existing_lock.period_start == date(2026, 6, 1)
    assert out.existing_lock.period_end == date(2026, 6, 30)
    assert out.existing_lock.dirty is False
