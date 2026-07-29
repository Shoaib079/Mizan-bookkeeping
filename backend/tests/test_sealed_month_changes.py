"""Which entries moved a sealed month (month close slice 3).

Slice 1 flags a closed month `dirty` and slice 2 states the size of the drift.
Neither says *which entry*, which is the only answer that leads anywhere.
"""

from __future__ import annotations

import uuid
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
from app.core.period_locks.models import PeriodLockKind
from app.core.period_locks.service import close_period
from app.db.session import entity_context
from app.features.auth import service as auth_service
from app.features.auth.schema import MembershipCreate, UserCreate
from app.features.period_locks import changes as changes_module

CASH_CODE = "1000"
JUNE_END = date(2026, 6, 30)
UNLOCK = "Late invoice found in the drawer"


@pytest.fixture
def books(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    owner = auth_service.create_user(
        db_session,
        UserCreate(email="changes-owner@example.com", display_name="Owner"),
    )
    auth_service.add_entity_member(
        db_session,
        restaurant_a.id,
        MembershipCreate(user_id=owner.id, role=EntityRole.OWNER),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {"entity_id": restaurant_a.id, "owner_id": owner.id, "accounts": accounts}


def _sale(db_session, books, entry_date, amount, *, unlock=None, note="Cash sale"):
    with entity_context(db_session, books["entity_id"]):
        entry = post_journal_entry(
            db_session,
            books["entity_id"],
            entry_date,
            note,
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
            period_unlock_reason=unlock,
        )
        db_session.commit()
        return entry.id


def _void(db_session, books, entry_id, *, unlock=UNLOCK, on=date(2026, 6, 10)):
    with entity_context(db_session, books["entity_id"]):
        void_journal_entry(
            db_session,
            books["entity_id"],
            entry_id,
            actor_id=books["owner_id"],
            reason="Recorded twice",
            void_date=on,
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


def _close_june_with_activity(db_session, books):
    _sale(db_session, books, date(2026, 6, 1), 100_000)
    return _close_june(db_session, books)


def _changes(db_session, books, lock_id):
    return changes_module.get_sealed_month_changes(
        db_session, books["entity_id"], lock_id
    )


def test_a_month_nobody_touched_lists_nothing(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)

    result = _changes(db_session, books, lock.id)
    assert result.entries == []
    assert result.reasons == []
    assert result.dirty is False


def test_entries_from_before_the_close_are_not_changes(db_session, books):
    """They were in the month when it was sealed — that's not a change."""
    _sale(db_session, books, date(2026, 6, 1), 100_000)
    _sale(db_session, books, date(2026, 6, 20), 50_000)
    lock = _close_june(db_session, books)

    assert _changes(db_session, books, lock.id).entries == []


def test_something_posted_after_the_close_is_listed(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)
    _sale(
        db_session,
        books,
        date(2026, 6, 25),
        30_000,
        unlock=UNLOCK,
        note="Forgotten invoice",
    )

    result = _changes(db_session, books, lock.id)
    assert len(result.entries) == 1
    row = result.entries[0]
    assert row.change_kind == changes_module.CHANGE_POSTED
    assert row.description == "Forgotten invoice"
    assert row.entry_date == date(2026, 6, 25)
    assert row.amount_kurus == 30_000


def test_a_void_shows_both_halves_and_names_the_removal(db_session, books):
    """The original keeps its creation date, so only voided_at reveals it —
    and the reversal is a separate entry that lands in the month too."""
    entry_id = _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)
    _void(db_session, books, entry_id)

    result = _changes(db_session, books, lock.id)
    kinds = {r.change_kind for r in result.entries}
    assert changes_module.CHANGE_VOIDED in kinds
    assert changes_module.CHANGE_REVERSAL in kinds

    removed = next(
        r for r in result.entries if r.change_kind == changes_module.CHANGE_VOIDED
    )
    assert removed.journal_entry_id == entry_id
    assert removed.amount_kurus == 100_000

    reversal = next(
        r for r in result.entries if r.change_kind == changes_module.CHANGE_REVERSAL
    )
    assert reversal.reverses_entry_id == entry_id


def test_an_entry_is_never_listed_twice(db_session, books):
    """Posted-after and voided-after could both match the same row."""
    lock = _close_june_with_activity(db_session, books)
    posted_id = _sale(
        db_session, books, date(2026, 6, 25), 30_000, unlock=UNLOCK, note="Added late"
    )
    _void(db_session, books, posted_id, on=date(2026, 6, 25))

    result = _changes(db_session, books, lock.id)
    ids = [r.journal_entry_id for r in result.entries]
    assert ids.count(posted_id) == 1



def test_the_reasons_given_are_returned(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)
    _sale(db_session, books, date(2026, 6, 25), 30_000, unlock=UNLOCK)

    result = _changes(db_session, books, lock.id)
    assert [r.reason for r in result.reasons] == [UNLOCK]


def test_a_change_dated_outside_the_month_is_not_listed(db_session, books):
    """July trading doesn't move June, however recently it was recorded."""
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)
    _sale(db_session, books, date(2026, 7, 5), 40_000)

    assert _changes(db_session, books, lock.id).entries == []


def test_newest_change_comes_first(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    lock = _close_june(db_session, books)
    _sale(db_session, books, date(2026, 6, 21), 10_000, unlock=UNLOCK, note="First")
    _sale(db_session, books, date(2026, 6, 22), 20_000, unlock=UNLOCK, note="Second")

    result = _changes(db_session, books, lock.id)
    assert [r.description for r in result.entries][:2] == ["Second", "First"]


def test_an_unknown_lock_is_a_404(db_session, books):
    with pytest.raises(LookupError):
        _changes(db_session, books, uuid.uuid4())
