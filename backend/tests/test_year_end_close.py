"""Year-end close moves the result into Retained Earnings (FINANCIAL_AUDIT F4).

Revenue and expense accounts are temporary — they measure one year's trading.
Left unclosed they accumulate forever, so by year three the balance sheet's
"unclosed net income" mixes three years and Retained Earnings sits at zero.

That zero was never only cosmetic: partner profit allocation already *debits*
3100 to distribute profit, so it has always drawn on an empty account.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.default_chart import (
    RETAINED_EARNINGS_CODE,
    SALARY_EXPENSE_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.balances import balance_as_of_kurus
from app.core.ledger.models import (
    JournalEntry,
    JournalEntrySource,
    JournalEntryStatus,
)
from app.core.ledger.posting import PostingLine, post_journal_entry, void_journal_entry
from app.core.period_locks import year_end
from app.core.period_locks.models import PeriodLockKind
from app.core.period_locks.service import close_period
from app.db.session import entity_context
from app.features.auth import service as auth_service
from app.features.auth.schema import MembershipCreate, UserCreate
from app.features.period_locks import service as lock_service
from app.features.reports import financial_statements

CASH_CODE = "1000"
DEC_31 = date(2026, 12, 31)


@pytest.fixture
def books(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    owner = auth_service.create_user(
        db_session,
        UserCreate(email="year-end-owner@example.com", display_name="Owner"),
    )
    auth_service.add_entity_member(
        db_session,
        restaurant_a.id,
        MembershipCreate(user_id=owner.id, role=EntityRole.OWNER),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {"entity_id": restaurant_a.id, "owner_id": owner.id, "accounts": accounts}


def _post(db_session, books, entry_date, debit_code, credit_code, amount):
    with entity_context(db_session, books["entity_id"]):
        entry = post_journal_entry(
            db_session,
            books["entity_id"],
            entry_date,
            "test entry",
            [
                PostingLine(
                    books["accounts"][debit_code], amount, AccountNormalBalance.DEBIT
                ),
                PostingLine(
                    books["accounts"][credit_code], amount, AccountNormalBalance.CREDIT
                ),
            ],
            actor_id=books["owner_id"],
            source=JournalEntrySource.MANUAL,
        )
        db_session.commit()
        return entry.id


def _sale(db_session, books, entry_date, amount):
    return _post(db_session, books, entry_date, CASH_CODE, SALES_REVENUE_CODE, amount)


def _wages(db_session, books, entry_date, amount):
    return _post(db_session, books, entry_date, SALARY_EXPENSE_CODE, CASH_CODE, amount)


def _balance(db_session, books, code, as_of=DEC_31):
    with entity_context(db_session, books["entity_id"]):
        account = db_session.get(Account, books["accounts"][code])
        return balance_as_of_kurus(db_session, account, as_of)


def _close_december(db_session, books, year=2026):
    return close_period(
        db_session,
        books["entity_id"],
        lock_kind=PeriodLockKind.MONTH,
        anchor_date=date(year, 12, 31),
        actor_id=books["owner_id"],
    )


def test_the_year_moves_into_retained_earnings(db_session, books):
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    _wages(db_session, books, date(2026, 3, 25), 200_000)

    year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )

    assert _balance(db_session, books, SALES_REVENUE_CODE) == 0
    assert _balance(db_session, books, SALARY_EXPENSE_CODE) == 0
    assert _balance(db_session, books, RETAINED_EARNINGS_CODE) == 300_000


def test_a_loss_reduces_retained_earnings(db_session, books):
    _sale(db_session, books, date(2026, 3, 10), 100_000)
    _wages(db_session, books, date(2026, 3, 25), 250_000)

    year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )
    assert _balance(db_session, books, RETAINED_EARNINGS_CODE) == -150_000


def test_the_closing_entry_is_kept_out_of_the_profit_and_loss(db_session, books):
    """Counting it would net the year to nil — the entry describes the close,
    not the trading."""
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    _wages(db_session, books, date(2026, 3, 25), 200_000)

    before = financial_statements.get_profit_and_loss(
        db_session, books["entity_id"], date(2026, 1, 1), DEC_31
    )
    assert before.net_income_kurus == 300_000

    year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )

    after = financial_statements.get_profit_and_loss(
        db_session, books["entity_id"], date(2026, 1, 1), DEC_31
    )
    assert after.net_income_kurus == 300_000, "the year's P&L must not change"
    assert after.total_revenue_kurus == 500_000


def test_next_year_starts_from_zero(db_session, books):
    """The point of closing: year two's P&L doesn't inherit year one."""
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )
    _sale(db_session, books, date(2027, 2, 5), 90_000)

    report = financial_statements.get_profit_and_loss(
        db_session, books["entity_id"], date(2027, 1, 1), date(2027, 12, 31)
    )
    assert report.total_revenue_kurus == 90_000


def test_the_balance_sheet_stops_stacking_years(db_session, books):
    """unclosed_net_income should show this year's result, not every year's."""
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )
    _sale(db_session, books, date(2027, 2, 5), 90_000)

    sheet = financial_statements.get_balance_sheet(
        db_session, books["entity_id"], date(2027, 6, 30)
    )
    assert sheet.equity.unclosed_net_income_kurus == 90_000
    retained = next(
        row for row in sheet.equity.accounts if row.code == RETAINED_EARNINGS_CODE
    )
    assert retained.balance_kurus == 500_000
    assert sheet.accounting_equation_balanced is True


def test_closing_twice_is_refused(db_session, books):
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )
    with pytest.raises(year_end.AlreadyClosedError):
        year_end.post_year_end_close(
            db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
        )


def test_a_year_with_no_trading_has_nothing_to_close(db_session, books):
    with pytest.raises(year_end.NothingToCloseError):
        year_end.post_year_end_close(
            db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
        )


def test_voiding_the_close_lets_the_year_be_closed_again(db_session, books):
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    entry = year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )

    with entity_context(db_session, books["entity_id"]):
        void_journal_entry(
            db_session,
            books["entity_id"],
            entry.id,
            actor_id=books["owner_id"],
            reason="Closed too early",
            void_date=DEC_31,
        )
        db_session.commit()

    preview = year_end.preview_year_end_close(
        db_session, books["entity_id"], year=2026
    )
    assert preview.already_closed is False
    assert _balance(db_session, books, SALES_REVENUE_CODE) == 500_000


def test_an_uncorrected_prior_year_is_swept_in_too(db_session, books):
    """Balances are read cumulatively — a year never closed still belongs in equity."""
    _sale(db_session, books, date(2025, 5, 1), 100_000)
    _sale(db_session, books, date(2026, 5, 1), 400_000)

    year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )
    assert _balance(db_session, books, RETAINED_EARNINGS_CODE) == 500_000
    assert _balance(db_session, books, SALES_REVENUE_CODE) == 0


def test_the_entry_is_marked_as_a_year_end_close(db_session, books):
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    entry = year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )
    assert entry.source == JournalEntrySource.YEAR_END_CLOSE
    assert entry.entry_date == DEC_31
    assert entry.status == JournalEntryStatus.POSTED


def test_the_year_cannot_be_closed_before_december_is(db_session, books):
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    with pytest.raises(lock_service.DecemberNotClosedError):
        lock_service.close_entity_year(
            db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
        )


def test_closing_the_year_works_through_a_sealed_december(db_session, books):
    """The entry is dated 31 December, inside a closed month — it must still post."""
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    _close_december(db_session, books)

    out = lock_service.close_entity_year(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )
    assert out.already_closed is True
    assert _balance(db_session, books, RETAINED_EARNINGS_CODE) == 500_000


def test_preview_reports_what_will_happen(db_session, books):
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    _wages(db_session, books, date(2026, 3, 25), 200_000)

    out = lock_service.get_entity_year_end_preview(
        db_session, books["entity_id"], year=2026
    )
    assert out.revenue_total_kurus == 500_000
    assert out.expense_total_kurus == 200_000
    assert out.net_result_kurus == 300_000
    assert out.december_closed is False
    assert out.can_close is False
    assert {line.code for line in out.lines} == {
        SALES_REVENUE_CODE,
        SALARY_EXPENSE_CODE,
    }


def test_the_closing_entry_is_not_cash(db_session, books):
    """It moves balances between ledger accounts and touches no money."""
    from app.features.reports import cash_flow

    _sale(db_session, books, date(2026, 3, 10), 500_000)
    before = cash_flow.get_cash_flow(
        db_session, books["entity_id"], date(2026, 1, 1), DEC_31
    )
    year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )
    after = cash_flow.get_cash_flow(
        db_session, books["entity_id"], date(2026, 1, 1), DEC_31
    )

    assert after.closing_cash_kurus == before.closing_cash_kurus
    assert after.operating.net_kurus == before.operating.net_kurus
    assert all(
        row.source != JournalEntrySource.YEAR_END_CLOSE.value for row in after.by_source
    )


def test_only_one_live_close_counts_when_searching(db_session, books):
    _sale(db_session, books, date(2026, 3, 10), 500_000)
    year_end.post_year_end_close(
        db_session, books["entity_id"], year=2026, actor_id=books["owner_id"]
    )
    with entity_context(db_session, books["entity_id"]):
        found = year_end.year_end_entry(db_session, 2026)
        assert found is not None
        others = list(
            db_session.scalars(
                select(JournalEntry).where(
                    JournalEntry.source == JournalEntrySource.YEAR_END_CLOSE.value
                )
            )
        )
    assert len(others) == 1
