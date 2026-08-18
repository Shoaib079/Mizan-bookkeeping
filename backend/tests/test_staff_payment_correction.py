"""Correcting a staff payment rebuilds every leg it wrote.

`correct_staff_journal_entry` rebuilds one subledger row, so it refused any
entry owning several — a payment that consumed an advance writes two, and one
that parks a surplus writes three. Its own comment named the way out:
*"Refusing is the honest answer until this can rebuild every leg."*

The legs are not stored facts. They are derived at post time from the cash,
what was owed and what advance stood. So the correction reverses the entry —
restoring both — and re-runs the poster that wrote it. The split is computed
once, by the code that owns it, rather than copied into a second place.

Two shapes share `JournalEntrySource.STAFF_PAYMENT` and the source cannot tell
them apart: an apply-advance moves no money, a salary payment always has one
money line. That is the whole discriminator.

The accrual must not move. Correcting what was paid must never change what the
employee earned — the last tests here hold that down, because it is the half
that would go wrong silently.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.core.staff import ledger as staff_ledger
from app.core.staff import posting as staff_posting
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.payment_correction import correct_staff_payment
from app.core.staff.types import StaffMovementType
from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied
from app.db.session import entity_context

from tests.test_staff import ACTOR_ID, staff_setup  # noqa: F401

SALARY = 3_000_000
PERIOD = {"period_year": 2026, "period_month": 7}


def _rows(db_session, entity_id, journal_entry_id) -> dict[str, int]:
    """Movement type -> amount, for one journal entry."""
    with entity_context(db_session, entity_id):
        rows = db_session.scalars(
            select(StaffLedgerEntry).where(
                StaffLedgerEntry.journal_entry_id == journal_entry_id
            )
        ).all()
        return {r.movement_type.value: r.amount_minor for r in rows}


@pytest.fixture
def paid_more_than_owed(db_session, staff_setup):  # noqa: F811
    """A payment that parks a surplus — three rows on one entry.

    Salary 30.000 accrued and 32.000 paid, so 30.000 clears the payable and
    2.000 becomes an advance. This is the shape the old code refused.
    """
    entity_id = staff_setup["entity_id"]
    result = staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        staff_setup["employee_id"],
        payment_date=date(2026, 8, 5),
        cash_minor=SALARY + 200_000,
        period_salary_minor=SALARY,
        description="Temmuz maaşı",
        actor_id=ACTOR_ID,
        payment_account_id=staff_setup["drawer"].gl_account_id,
        **PERIOD,
    )
    return {**staff_setup, "journal_entry_id": result.journal_entry.id}


def _correct(db_session, ctx, amount):
    return correct_staff_payment(
        db_session,
        ctx["entity_id"],
        ctx["journal_entry_id"],
        payment_date=date(2026, 8, 5),
        amount_minor=amount,
        description="Temmuz maaşı (düzeltildi)",
        actor_id=ACTOR_ID,
        payment_account_id=ctx["drawer"].gl_account_id,
        reason="Paid less than recorded",
    )


def test_the_old_refusal_was_real(db_session, paid_more_than_owed):
    """Guard the guard: if this entry only had one row, the tests below would
    be proving nothing about the case that was refused."""
    rows = _rows(db_session, paid_more_than_owed["entity_id"],
                 paid_more_than_owed["journal_entry_id"])
    assert len(rows) > 1, rows
    assert rows[StaffMovementType.ADVANCE_PAID.value] == -200_000


def test_correcting_down_rebuilds_every_leg(db_session, paid_more_than_owed):
    """Paying 30.000 instead of 32.000 leaves no surplus, so no advance."""
    result = _correct(db_session, paid_more_than_owed, SALARY)

    rows = _rows(db_session, paid_more_than_owed["entity_id"],
                 result.corrected.journal_entry.id)
    assert rows.get(StaffMovementType.SALARY_PAYMENT.value) == -SALARY
    assert StaffMovementType.ADVANCE_PAID.value not in rows, (
        "the surplus row should be gone, not left behind at its old amount"
    )


def test_the_advance_it_had_parked_is_gone(db_session, paid_more_than_owed):
    """The figure an owner reads. Rebuilding one row would have left this at
    2.000 while the payment said something else."""
    _correct(db_session, paid_more_than_owed, SALARY)

    with entity_context(db_session, paid_more_than_owed["entity_id"]):
        advance = staff_ledger.outstanding_advance_minor(
            db_session, paid_more_than_owed["employee_id"]
        )
    assert advance == 0


def test_what_is_still_owed_follows_the_new_amount(db_session, paid_more_than_owed):
    _correct(db_session, paid_more_than_owed, SALARY - 500_000)

    with entity_context(db_session, paid_more_than_owed["entity_id"]):
        owed = staff_ledger.remaining_accrual_minor(
            db_session, paid_more_than_owed["employee_id"]
        )
    assert owed == 500_000


def test_the_accrual_does_not_move(db_session, paid_more_than_owed):
    """Correcting a payment must never change what was earned.

    The repost is handed the period's current accrued figure, so the ensure
    step returns early. Passing the original salary would top up a period
    nobody reversed.
    """
    entity_id = paid_more_than_owed["entity_id"]
    with entity_context(db_session, entity_id):
        before = staff_ledger.period_accrued_minor(
            db_session, paid_more_than_owed["employee_id"], **PERIOD
        )

    _correct(db_session, paid_more_than_owed, SALARY - 500_000)

    with entity_context(db_session, entity_id):
        after = staff_ledger.period_accrued_minor(
            db_session, paid_more_than_owed["employee_id"], **PERIOD
        )
    assert after == before == SALARY


def test_the_original_is_reversed_not_rewritten(db_session, paid_more_than_owed):
    result = _correct(db_session, paid_more_than_owed, SALARY)

    with entity_context(db_session, paid_more_than_owed["entity_id"]):
        original = db_session.get(
            JournalEntry, paid_more_than_owed["journal_entry_id"]
        )
        assert original is not None
        assert original.status == JournalEntryStatus.VOIDED
    assert result.corrected.journal_entry.id != paid_more_than_owed["journal_entry_id"]


def test_the_books_still_tie(db_session, paid_more_than_owed):
    """Three entries now exist where one did, and 1300 and 2250 have to agree
    with the subledger after all of it."""
    _correct(db_session, paid_more_than_owed, SALARY - 500_000)

    with entity_context(db_session, paid_more_than_owed["entity_id"]):
        assert_entity_control_accounts_tied(
            db_session, paid_more_than_owed["entity_id"]
        )


def test_an_apply_advance_is_corrected_through_the_same_door(
    db_session, staff_setup  # noqa: F811
):
    """The other shape under the same journal source.

    It moves no money, which is the only thing separating it from a payment.
    Reposting it recomputes the cap against the reversed state rather than
    trusting the old amount.
    """
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 8, 1),
        amount_minor=SALARY,
        description="Temmuz tahakkuk",
        actor_id=ACTOR_ID,
        **PERIOD,
    )
    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 8, 2),
        amount_minor=1_000_000,
        description="Avans",
        actor_id=ACTOR_ID,
        payment_account_id=staff_setup["drawer"].gl_account_id,
    )
    applied = staff_posting.post_apply_advance(
        db_session,
        entity_id,
        employee_id,
        applied_date=date(2026, 8, 3),
        description="Advance applied",
        actor_id=ACTOR_ID,
        amount_minor=1_000_000,
    )

    result = correct_staff_payment(
        db_session,
        entity_id,
        applied.journal_entry.id,
        payment_date=date(2026, 8, 3),
        amount_minor=400_000,
        description="Advance applied (düzeltildi)",
        actor_id=ACTOR_ID,
        reason="Applied too much",
    )

    rows = _rows(db_session, entity_id, result.corrected.journal_entry.id)
    assert rows.get(StaffMovementType.ADVANCE_APPLIED.value) == 400_000
    assert rows.get(StaffMovementType.SALARY_PAYMENT.value) == -400_000

    with entity_context(db_session, entity_id):
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) == 600_000
