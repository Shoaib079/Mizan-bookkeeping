"""Commission is the amount the bank charged, not the clearing leftover.

The old behaviour booked whatever was left in 1400, assuming the residual WAS
the commission. It isn't — it's commission plus any sales the bank hasn't
deposited yet, which is how a month of undeposited sales became a 184k expense
(BUGLOG 2026-07-13). The amount now comes from the statement, and the leftover
stays in clearing as what it really is.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import (
    CARD_COMMISSION_CODE,
    CARD_SALES_CLEARING_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.balances import balance_as_of_kurus
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.pos import service as pos_service

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def books(db_session, restaurant_a):
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


def _sales(db_session, books, amount, on=date(2026, 6, 5)):
    pos_posting.post_card_sales_batch(
        db_session,
        books["entity_id"],
        sales_date=on,
        gross_amount_kurus=amount,
        description="Card sales",
        actor_id=ACTOR_ID,
    )


def _deposit(db_session, books, amount, on=date(2026, 6, 8)):
    pos_posting.post_pos_settlement(
        db_session,
        books["entity_id"],
        money_account_id=books["bank"].id,
        settlement_date=on,
        amount_kurus=amount,
        description="Net deposit",
        actor_id=ACTOR_ID,
    )


def _balance(db_session, books, code, as_of=date(2026, 6, 30)):
    with entity_context(db_session, books["entity_id"]):
        account = db_session.get(Account, books["accounts"][code])
        return balance_as_of_kurus(db_session, account, as_of)


def test_only_the_stated_amount_is_booked(db_session, books):
    """The leftover stays put — it's undeposited sales, not commission."""
    _sales(db_session, books, 1_000_000)
    _deposit(db_session, books, 500_000)
    # 500.000 sits in clearing: part commission, part not-yet-deposited.

    result = pos_posting.post_card_commission(
        db_session,
        books["entity_id"],
        commission_date=date(2026, 6, 30),
        amount_kurus=38_000,
        description="June commission",
        actor_id=ACTOR_ID,
    )

    assert result.commission_kurus == 38_000
    assert _balance(db_session, books, CARD_COMMISSION_CODE) == 38_000
    # 500.000 − 38.000 still awaiting deposit, NOT swept to expense.
    assert _balance(db_session, books, CARD_SALES_CLEARING_CODE) == 462_000


def test_more_than_clearing_holds_is_refused(db_session, books):
    """Usually means sales or deposits for the period aren't recorded yet."""
    _sales(db_session, books, 100_000)
    _deposit(db_session, books, 96_000)

    with pytest.raises(pos_posting.CommissionExceedsClearingError):
        pos_posting.post_card_commission(
            db_session,
            books["entity_id"],
            commission_date=date(2026, 6, 30),
            amount_kurus=10_000,
            description="Too much",
            actor_id=ACTOR_ID,
        )
    # Nothing posted.
    assert _balance(db_session, books, CARD_COMMISSION_CODE) == 0


def test_exactly_the_residual_is_allowed(db_session, books):
    _sales(db_session, books, 100_000)
    _deposit(db_session, books, 96_000)

    result = pos_posting.post_card_commission(
        db_session,
        books["entity_id"],
        commission_date=date(2026, 6, 30),
        amount_kurus=4_000,
        description="June commission",
        actor_id=ACTOR_ID,
    )
    assert result.commission_kurus == 4_000
    assert _balance(db_session, books, CARD_SALES_CLEARING_CODE) == 0


def test_the_check_uses_the_residual_at_the_commission_date(db_session, books):
    """A later month's undeposited sales must not authorise a bigger amount."""
    _sales(db_session, books, 100_000, on=date(2026, 6, 5))
    _deposit(db_session, books, 96_000, on=date(2026, 6, 8))
    _sales(db_session, books, 900_000, on=date(2026, 7, 3))

    with pytest.raises(pos_posting.CommissionExceedsClearingError):
        pos_posting.post_card_commission(
            db_session,
            books["entity_id"],
            commission_date=date(2026, 6, 30),
            amount_kurus=50_000,
            description="Would raid July",
            actor_id=ACTOR_ID,
        )


def test_a_zero_amount_is_rejected(db_session, books):
    _sales(db_session, books, 100_000)
    _deposit(db_session, books, 96_000)
    with pytest.raises(ValueError):
        pos_posting.post_card_commission(
            db_session,
            books["entity_id"],
            commission_date=date(2026, 6, 30),
            amount_kurus=0,
            description="Nothing",
            actor_id=ACTOR_ID,
        )


def test_rate_percent_is_none_without_card_sales():
    """Neither 0% nor infinity is true for a month with no trading."""
    assert pos_service.commission_rate_percent(1_000, 0) is None


def test_rate_percent_reads_as_a_percentage():
    assert pos_service.commission_rate_percent(1_240_000, 32_600_000) == 3.8
    # A mistyped extra zero is unmissable at a glance.
    assert pos_service.commission_rate_percent(12_400_000, 32_600_000) == 38.0


def test_rate_history_reports_the_month_it_happened(db_session, books):
    _sales(db_session, books, 1_000_000, on=date(2026, 6, 5))
    _deposit(db_session, books, 960_000, on=date(2026, 6, 8))
    pos_posting.post_card_commission(
        db_session,
        books["entity_id"],
        commission_date=date(2026, 6, 30),
        amount_kurus=40_000,
        description="June commission",
        actor_id=ACTOR_ID,
    )

    history = pos_service.get_commission_rate_history(
        db_session, books["entity_id"], months=36
    )
    june = next(
        p for p in history.periods if (p.year, p.month) == (2026, 6)
    )
    assert june.card_sales_kurus == 1_000_000
    assert june.commission_kurus == 40_000
    assert june.rate_percent == 4.0


def test_rate_history_skips_months_with_no_activity(db_session, books):
    _sales(db_session, books, 500_000, on=date(2026, 6, 5))

    history = pos_service.get_commission_rate_history(
        db_session, books["entity_id"], months=36
    )
    months = {(p.year, p.month) for p in history.periods}
    assert (2026, 6) in months
    # A quiet month is noise, not history.
    assert (2026, 5) not in months
