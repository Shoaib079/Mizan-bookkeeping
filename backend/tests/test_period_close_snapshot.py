"""Closing a month freezes what it reported (FINANCIAL_AUDIT F3).

Balances are derived, and a void excludes both the original entry and its
reversal from every balance query. So voiding a January entry in March made
January's P&L change retroactively — a month already sent to the accountant
could quietly become a different month. These tests pin that it no longer does.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import PostingLine, post_journal_entry, void_journal_entry
from app.core.period_locks.models import PeriodCloseSnapshot, PeriodLock, PeriodLockKind
from app.core.period_locks.service import close_period, reopen_period
from app.db.session import entity_context
from app.features.auth import service as auth_service
from app.features.auth.schema import MembershipCreate, UserCreate
from app.features.reports import financial_statements

CASH_CODE = "1000"
JUNE_START = date(2026, 6, 1)
JUNE_END = date(2026, 6, 30)
UNLOCK = "Correcting a duplicate found later"


@pytest.fixture
def books(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    owner = auth_service.create_user(
        db_session,
        UserCreate(email="snapshot-owner@example.com", display_name="Owner"),
    )
    # The lock guard only lets an OWNER write into a closed period, and it
    # reads the membership — a bare user is treated as a stranger.
    auth_service.add_entity_member(
        db_session,
        restaurant_a.id,
        MembershipCreate(user_id=owner.id, role=EntityRole.OWNER),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {"entity_id": restaurant_a.id, "owner_id": owner.id, "accounts": accounts}


def _sale(db_session, books, entry_date: date, amount: int):
    """Dr cash / Cr sales — a plain cash sale."""
    with entity_context(db_session, books["entity_id"]):
        entry = post_journal_entry(
            db_session,
            books["entity_id"],
            entry_date,
            f"Cash sale {entry_date.isoformat()}",
            [
                PostingLine(
                    books["accounts"][CASH_CODE], amount, AccountNormalBalance.DEBIT
                ),
                PostingLine(
                    books["accounts"][SALES_REVENUE_CODE],
                    amount,
                    AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=books["owner_id"],
            source=JournalEntrySource.MANUAL,
        )
        db_session.commit()
        return entry.id


def _void(db_session, books, entry_id, *, unlock: str | None = UNLOCK):
    with entity_context(db_session, books["entity_id"]):
        void_journal_entry(
            db_session,
            books["entity_id"],
            entry_id,
            actor_id=books["owner_id"],
            reason="Recorded twice",
            void_date=date(2026, 6, 10),
            period_unlock_reason=unlock,
        )
        db_session.commit()


def _close_june(db_session, books):
    return close_period(
        db_session,
        books["entity_id"],
        lock_kind=PeriodLockKind.MONTH,
        anchor_date=JUNE_END,
        actor_id=books["owner_id"],
    )


def _pnl(db_session, books, **kwargs):
    return financial_statements.get_profit_and_loss(
        db_session, books["entity_id"], JUNE_START, JUNE_END, **kwargs
    )


def _snapshot_rows(db_session, books, lock_id):
    with entity_context(db_session, books["entity_id"]):
        return list(
            db_session.scalars(
                select(PeriodCloseSnapshot).where(
                    PeriodCloseSnapshot.period_lock_id == lock_id
                )
            )
        )


def test_closing_a_month_writes_a_row_per_account(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)

    rows = _snapshot_rows(db_session, books, lock.id)
    with entity_context(db_session, books["entity_id"]):
        account_count = len(list(db_session.scalars(select(Account))))

    assert len(rows) == account_count
    revenue = next(
        r for r in rows if r.account_id == books["accounts"][SALES_REVENUE_CODE]
    )
    assert revenue.period_activity_kurus == 100_000
    assert revenue.closing_balance_kurus == 100_000
    assert revenue.period_credit_kurus == 100_000
    assert revenue.period_debit_kurus == 0


def test_closing_a_day_writes_no_snapshot(db_session, books):
    """A day close is a drawer procedure, not a reporting boundary."""
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = close_period(
        db_session,
        books["entity_id"],
        lock_kind=PeriodLockKind.DAY,
        anchor_date=date(2026, 6, 10),
        actor_id=books["owner_id"],
    )
    assert _snapshot_rows(db_session, books, lock.id) == []


def test_a_void_after_close_no_longer_rewrites_the_month(db_session, books):
    """The F3 reproduction: void a June entry later, June must not move."""
    entry_id = _sale(db_session, books, date(2026, 6, 10), 100_000)
    _close_june(db_session, books)

    assert _pnl(db_session, books).net_income_kurus == 100_000

    _void(db_session, books, entry_id)

    after = _pnl(db_session, books)
    assert after.net_income_kurus == 100_000, "sealed June must not move"
    assert after.source == "as_closed"

    live = _pnl(db_session, books, view="live")
    assert live.net_income_kurus == 0
    assert live.source == "live"


def test_writing_into_a_sealed_month_reports_the_drift(db_session, books):
    entry_id = _sale(db_session, books, date(2026, 6, 10), 100_000)
    _close_june(db_session, books)

    sealed = _pnl(db_session, books)
    assert sealed.sealed is not None
    assert sealed.sealed.drifted is False
    assert sealed.sealed.drift_kurus is None

    # The guard flags the lock dirty as part of allowing an owner write.
    _void(db_session, books, entry_id)

    drifted = _pnl(db_session, books)
    assert drifted.sealed is not None
    assert drifted.sealed.drifted is True
    # Live reads 0 against a sealed 100.000 — the books moved down by 100.000.
    assert drifted.sealed.drift_kurus == -100_000


def test_an_open_month_is_always_live(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    report = _pnl(db_session, books)
    assert report.source == "live"
    assert report.sealed is None


def test_reopening_returns_the_month_to_live(db_session, books):
    entry_id = _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)
    reopen_period(
        db_session,
        books["entity_id"],
        lock.id,
        actor_id=books["owner_id"],
        reason="Corrections",
    )

    _void(db_session, books, entry_id, unlock=None)

    report = _pnl(db_session, books)
    assert report.source == "live"
    assert report.net_income_kurus == 0


def test_reclosing_reseals_at_the_corrected_figures(db_session, books):
    entry_id = _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)
    reopen_period(
        db_session, books["entity_id"], lock.id, actor_id=books["owner_id"]
    )
    _void(db_session, books, entry_id, unlock=None)
    _sale(db_session, books, date(2026, 6, 12), 70_000)
    relock = _close_june(db_session, books)

    report = _pnl(db_session, books)
    assert report.source == "as_closed"
    assert report.net_income_kurus == 70_000

    rows = _snapshot_rows(db_session, books, relock.id)
    with entity_context(db_session, books["entity_id"]):
        account_count = len(list(db_session.scalars(select(Account))))
    assert len(rows) == account_count, "re-close replaces, never duplicates"


def test_a_range_that_straddles_months_stays_live(db_session, books):
    """No single snapshot can honestly answer 15 June–15 July."""
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    _close_june(db_session, books)

    report = financial_statements.get_profit_and_loss(
        db_session, books["entity_id"], date(2026, 6, 15), date(2026, 7, 15)
    )
    assert report.source == "live"
    assert report.sealed is None


def test_balance_sheet_at_a_sealed_month_end_is_frozen(db_session, books):
    entry_id = _sale(db_session, books, date(2026, 6, 10), 100_000)
    _close_june(db_session, books)
    _void(db_session, books, entry_id)

    sheet = financial_statements.get_balance_sheet(
        db_session, books["entity_id"], JUNE_END
    )
    assert sheet.source == "as_closed"
    assert sheet.total_assets_kurus == 100_000
    # Rebuilt from the same frozen figures, so it still balances.
    assert sheet.accounting_equation_balanced is True
    assert sheet.equity.unclosed_net_income_kurus == 100_000

    live = financial_statements.get_balance_sheet(
        db_session, books["entity_id"], JUNE_END, view="live"
    )
    assert live.source == "live"
    assert live.total_assets_kurus == 0


def test_balance_sheet_mid_month_is_live_even_in_a_closed_month(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    _close_june(db_session, books)

    sheet = financial_statements.get_balance_sheet(
        db_session, books["entity_id"], date(2026, 6, 15)
    )
    assert sheet.source == "live"


def test_a_month_closed_before_snapshots_existed_serves_live(db_session, books):
    """No frozen figures to show — don't report an empty statement."""
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)

    with entity_context(db_session, books["entity_id"]):
        for row in db_session.scalars(
            select(PeriodCloseSnapshot).where(
                PeriodCloseSnapshot.period_lock_id == lock.id
            )
        ):
            db_session.delete(row)
        db_session.commit()

    report = _pnl(db_session, books)
    assert report.source == "live"
    assert report.net_income_kurus == 100_000


def test_a_deactivated_account_still_counts_in_a_sealed_month(db_session, books):
    """Deactivating an account must not change a month already sent out."""
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    _close_june(db_session, books)

    with entity_context(db_session, books["entity_id"]):
        account = db_session.get(Account, books["accounts"][SALES_REVENUE_CODE])
        account.is_active = False
        db_session.commit()

    report = _pnl(db_session, books)
    assert report.source == "as_closed"
    assert report.total_revenue_kurus == 100_000


def test_lock_and_snapshot_commit_together(db_session, books):
    """A lock without its snapshot would claim sealed while serving live."""
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)

    with entity_context(db_session, books["entity_id"]):
        persisted = db_session.get(PeriodLock, lock.id)
        assert persisted is not None
    assert _snapshot_rows(db_session, books, lock.id) != []
