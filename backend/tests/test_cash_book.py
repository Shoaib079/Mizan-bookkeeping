"""Cash book + large-variance guard on drawer close."""

from __future__ import annotations

from datetime import date

import pytest

from app.core.cash import posting as cash_posting
from app.core.cash.posting import LargeCashVarianceError, _variance_is_implausible
from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.cash.models import CashMovementDirection
from app.features.reports import cash_book
from app.features.reports.cash_book import MoneyAccountKindNotSupportedError
from app.features.reports.service import InvalidDateRangeError

from tests.test_cash_drawer import cash_setup  # noqa: F401

FROM = date(2026, 6, 1)
TO = date(2026, 6, 30)


def _book(db_session, entity_id, drawer_id, from_date=FROM, to_date=TO):
    return cash_book.get_cash_book(
        db_session, entity_id, drawer_id, from_date, to_date
    )


def _move(db_session, setup, *, direction, amount, day, desc):
    return cash_posting.post_cash_movement(
        db_session,
        setup["entity_id"],
        money_account_id=setup["drawer"].id,
        movement_date=day,
        direction=direction,
        amount_kurus=amount,
        offset_account_id=setup["accounts"][SALES_REVENUE_CODE],
        description=desc,
        actor_id=setup["actor_id"],
    )


def _cash_in(db_session, setup, amount, day, desc="Cash sales"):
    return _move(
        db_session, setup, direction=CashMovementDirection.IN, amount=amount,
        day=day, desc=desc,
    )


def _cash_out(db_session, setup, amount, day, desc="Cash out"):
    return _move(
        db_session, setup, direction=CashMovementDirection.OUT, amount=amount,
        day=day, desc=desc,
    )


def test_cash_book_rolls_forward_and_ties_to_gl(db_session, cash_setup):
    """Closing must equal the GL balance the drawer count compares against."""
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]

    _cash_in(db_session, cash_setup, 500_000, date(2026, 6, 2))
    _cash_out(db_session, cash_setup, 120_000, date(2026, 6, 3), "Peynir")
    _cash_out(db_session, cash_setup, 80_000, date(2026, 6, 5), "Deposit")

    report = _book(db_session, entity_id, drawer.id)

    assert report.opening_kurus == 0
    assert report.total_in_kurus == 500_000
    assert report.total_out_kurus == 200_000
    assert report.closing_kurus == 300_000
    assert (
        report.opening_kurus + report.total_in_kurus - report.total_out_kurus
        == report.closing_kurus
    )

    with entity_context(db_session, entity_id):
        gl_balance = banking_service.gl_balance_kurus(
            db_session, drawer.gl_account_id, AccountNormalBalance.DEBIT
        )
    assert report.closing_kurus == gl_balance


def test_cash_book_rows_carry_a_running_balance(db_session, cash_setup):
    _cash_in(db_session, cash_setup, 300_000, date(2026, 6, 2))
    _cash_out(db_session, cash_setup, 100_000, date(2026, 6, 4))

    report = _book(db_session, cash_setup["entity_id"], cash_setup["drawer"].id)

    assert [(r.in_kurus, r.out_kurus, r.balance_kurus) for r in report.rows] == [
        (300_000, 0, 300_000),
        (0, 100_000, 200_000),
    ]
    assert report.rows[-1].balance_kurus == report.closing_kurus


def test_opening_carries_from_before_the_range(db_session, cash_setup):
    _cash_in(db_session, cash_setup, 250_000, date(2026, 5, 20))
    _cash_in(db_session, cash_setup, 100_000, date(2026, 6, 10))

    report = _book(db_session, cash_setup["entity_id"], cash_setup["drawer"].id)
    assert report.opening_kurus == 250_000
    assert report.total_in_kurus == 100_000
    assert report.closing_kurus == 350_000


def test_cash_book_groups_by_source(db_session, cash_setup):
    _cash_in(db_session, cash_setup, 100_000, date(2026, 6, 2))
    _cash_in(db_session, cash_setup, 50_000, date(2026, 6, 3))

    report = _book(db_session, cash_setup["entity_id"], cash_setup["drawer"].id)
    assert sum(t.in_kurus for t in report.source_totals) == 150_000
    assert sum(t.entry_count for t in report.source_totals) == len(report.rows)


def test_cash_book_rejects_a_backwards_range(db_session, cash_setup):
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]

    with pytest.raises(InvalidDateRangeError):
        cash_book.get_cash_book(db_session, entity_id, drawer.id, TO, FROM)


def test_a_bank_account_gets_a_book_too(db_session, cash_setup):
    """The cash-only limit was never an accounting one — a bank has GL lines
    just the same. Excluding banks meant you could see *that* the books and a
    statement disagreed but not *where* (2026-07-29)."""
    from app.features.banking.models import MoneyAccountKind
    from app.features.banking.schema import MoneyAccountCreate

    entity_id = cash_setup["entity_id"]
    bank = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK, name="Garanti", bank_name="Garanti"
        ),
    )

    book = cash_book.get_cash_book(db_session, entity_id, bank.id, FROM, TO)
    assert book.money_account_id == bank.id
    assert book.money_account_name == "Garanti"
    # A bank has no drawer counts — empty, not an error.
    assert book.counts == []
    assert book.last_count is None


def test_a_credit_card_is_still_refused(db_session, cash_setup):
    """A liability reads back-to-front as money in / money out."""
    from app.features.banking.models import MoneyAccountKind
    from app.features.banking.schema import MoneyAccountCreate

    entity_id = cash_setup["entity_id"]
    card = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.CREDIT_CARD, name="Bonus Card"
        ),
    )
    with pytest.raises(MoneyAccountKindNotSupportedError):
        cash_book.get_cash_book(db_session, entity_id, card.id, FROM, TO)


def test_variance_guard_thresholds() -> None:
    """Small drift passes; a large gap needs confirmation."""
    assert _variance_is_implausible(0, 1_000_000) is False
    # Under the 500,00 ₺ floor — routine.
    assert _variance_is_implausible(15_000, 1_000_000) is False
    # Over the floor and over 10% of expected — suspicious.
    assert _variance_is_implausible(200_000, 1_000_000) is True
    assert _variance_is_implausible(-200_000, 1_000_000) is True
    # Big drawer: 10% dominates the floor, so 600,00 ₺ is still routine.
    assert _variance_is_implausible(60_000, 10_000_000) is False


def test_drawer_close_blocks_large_variance_until_confirmed(db_session, cash_setup):
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]

    _cash_in(db_session, cash_setup, 1_000_000, date(2026, 6, 2))

    with pytest.raises(LargeCashVarianceError):
        cash_posting.close_cash_drawer_session(
            db_session,
            entity_id,
            money_account_id=drawer.id,
            session_date=date(2026, 6, 2),
            counted_balance_kurus=10_000,
            actor_id=cash_setup["actor_id"],
        )

    result = cash_posting.close_cash_drawer_session(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        session_date=date(2026, 6, 2),
        counted_balance_kurus=10_000,
        actor_id=cash_setup["actor_id"],
        confirm_large_variance=True,
    )
    assert result.session.over_short_kurus == 10_000 - 1_000_000


def test_drawer_close_allows_small_variance_without_confirmation(
    db_session, cash_setup
):
    _cash_in(db_session, cash_setup, 1_000_000, date(2026, 6, 2))

    result = cash_posting.close_cash_drawer_session(
        db_session,
        cash_setup["entity_id"],
        money_account_id=cash_setup["drawer"].id,
        session_date=date(2026, 6, 2),
        counted_balance_kurus=995_000,
        actor_id=cash_setup["actor_id"],
    )
    assert result.session.over_short_kurus == -5_000


def test_cash_book_surfaces_the_last_count(db_session, cash_setup):
    _cash_in(db_session, cash_setup, 400_000, date(2026, 6, 2))
    cash_posting.close_cash_drawer_session(
        db_session,
        cash_setup["entity_id"],
        money_account_id=cash_setup["drawer"].id,
        session_date=date(2026, 6, 2),
        counted_balance_kurus=398_000,
        actor_id=cash_setup["actor_id"],
    )

    report = _book(db_session, cash_setup["entity_id"], cash_setup["drawer"].id)
    assert report.last_count is not None
    assert report.last_count.counted_kurus == 398_000
    assert report.last_count.over_short_kurus == -2_000
