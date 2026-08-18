"""The apply-advance poster + cash-only salary payments (BUGLOG 2026-07-13).

Applying nets an outstanding advance against ALL unpaid salary — regular
accruals AND extra-days, which were previously invisible to it and so made
advances impossible to clear against extra-days owed.

There is no longer a button or a route for this. `post_apply_advance` is now
reached only from `advance_settlement`, which runs it after every staff write
so the two sides can never both stand, and from `payment_correction` when it
reposts one. The tests here are of the poster, which is why they call it
directly; `test_advance_never_stands_beside_owed.py` covers the invariant, and
holds down that no orphan endpoint was left behind.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.core.chart_of_accounts.default_chart import (
    EMPLOYEE_ADVANCES_CODE,
    SALARIES_PAYABLE_CODE,
)
from app.core.staff import ledger as staff_ledger
from app.core.staff import posting as staff_posting
from app.core.staff.posting import InvalidStaffPostingError
from app.db.session import entity_context

from tests.test_staff import (  # reuse fixtures/helpers
    ACTOR_ID,
    _gl_balance,
    _subledger_balance,
    staff_setup,
)
from app.core.chart_of_accounts.types import AccountNormalBalance


def _accrue(db_session, entity_id, employee_id, amount, year, month):
    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(year, month, 28),
        amount_minor=amount,
        description=f"Salary {year}-{month:02d}",
        actor_id=ACTOR_ID,
        period_year=year,
        period_month=month,
    )


def _advance(db_session, entity_id, employee_id, drawer, amount, day):
    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=day,
        amount_minor=amount,
        description="Avans",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )


def test_extra_days_count_as_salary_owed(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]

    staff_posting.post_extra_days_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 8),
        extra_days=7,
        per_day_minor=192_000,
        description="Extra days (7 × 1,920.00 ₺/day)",
        actor_id=ACTOR_ID,
        payment_account_id=None,  # accrue-only mode
    )
    with entity_context(db_session, entity_id):
        assert staff_ledger.remaining_accrual_minor(db_session, employee_id) == 1_344_000


def test_apply_advance_nets_against_extra_days(db_session, staff_setup) -> None:
    """Latif reproduction: 13.440 extra-days owed + 13.440 advance → both zero."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    accounts = staff_setup["accounts"]
    drawer = staff_setup["drawer"]

    staff_posting.post_extra_days_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 8),
        extra_days=7,
        per_day_minor=192_000,
        description="Extra days",
        actor_id=ACTOR_ID,
        payment_account_id=None,
    )
    _advance(db_session, entity_id, employee_id, drawer, 1_344_000, date(2026, 6, 8))

    balance_before = _subledger_balance(db_session, entity_id, employee_id)

    result = staff_posting.post_apply_advance(
        db_session,
        entity_id,
        employee_id,
        applied_date=date(2026, 6, 9),
        description="Apply advance",
        actor_id=ACTOR_ID,
    )
    assert result.advance_applied_minor == 1_344_000

    with entity_context(db_session, entity_id):
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) == 0
        assert staff_ledger.remaining_accrual_minor(db_session, employee_id) == 0
    assert _gl_balance(
        db_session, entity_id, accounts[SALARIES_PAYABLE_CODE], AccountNormalBalance.CREDIT
    ) == 0
    assert _gl_balance(
        db_session, entity_id, accounts[EMPLOYEE_ADVANCES_CODE], AccountNormalBalance.DEBIT
    ) == 0
    # No cash moved — staff balance unchanged by the apply.
    assert _subledger_balance(db_session, entity_id, employee_id) == balance_before


def test_apply_advance_caps_at_min_of_advance_and_owed(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    _accrue(db_session, entity_id, employee_id, 500_000, 2026, 6)
    _advance(db_session, entity_id, employee_id, drawer, 800_000, date(2026, 6, 5))

    result = staff_posting.post_apply_advance(
        db_session,
        entity_id,
        employee_id,
        applied_date=date(2026, 6, 30),
        description="Apply advance",
        actor_id=ACTOR_ID,
    )
    # Owed 500k < advance 800k → apply 500k, leave 300k outstanding.
    assert result.advance_applied_minor == 500_000
    with entity_context(db_session, entity_id):
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) == 300_000
        assert staff_ledger.remaining_accrual_minor(db_session, employee_id) == 0


def test_apply_advance_rejects_over_cap_and_nothing_to_apply(
    db_session, staff_setup
) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    # No advance, no owed → nothing to apply.
    with pytest.raises(InvalidStaffPostingError):
        staff_posting.post_apply_advance(
            db_session,
            entity_id,
            employee_id,
            applied_date=date(2026, 6, 1),
            description="Apply advance",
            actor_id=ACTOR_ID,
        )

    _accrue(db_session, entity_id, employee_id, 500_000, 2026, 6)
    _advance(db_session, entity_id, employee_id, drawer, 200_000, date(2026, 6, 5))

    # Explicit amount above the cap (200k) is rejected.
    with pytest.raises(InvalidStaffPostingError):
        staff_posting.post_apply_advance(
            db_session,
            entity_id,
            employee_id,
            applied_date=date(2026, 6, 30),
            description="Apply advance",
            actor_id=ACTOR_ID,
            amount_minor=300_000,
        )

    # Partial apply below the cap works.
    result = staff_posting.post_apply_advance(
        db_session,
        entity_id,
        employee_id,
        applied_date=date(2026, 6, 30),
        description="Apply advance",
        actor_id=ACTOR_ID,
        amount_minor=150_000,
    )
    assert result.advance_applied_minor == 150_000
    with entity_context(db_session, entity_id):
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) == 50_000


def test_salary_payment_auto_applies_advance_against_all_owed(
    db_session, staff_setup
) -> None:
    """15.000 cash against 38.000 owed with a 13.515 advance → advance clears."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    _advance(db_session, entity_id, employee_id, drawer, 1_351_500, date(2026, 6, 20))
    result = staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 7, 6),
        cash_minor=1_500_000,
        period_year=2026,
        period_month=6,
        period_salary_minor=3_800_000,
        description="Salary payment",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    # Owed 38.000; cash 15.000 settles part, advance 13.515 clears more.
    assert result.advance_applied_minor == 1_351_500
    with entity_context(db_session, entity_id):
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) == 0
        # 38.000 − 15.000 cash − 13.515 advance still owed.
        assert staff_ledger.remaining_accrual_minor(db_session, employee_id) == 948_500


def test_salary_payment_auto_clears_extra_days_advance(db_session, staff_setup) -> None:
    """Latif via payment: extra-days owed is now visible, so the advance clears."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_extra_days_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 8),
        extra_days=7,
        per_day_minor=192_000,
        description="Extra days",
        actor_id=ACTOR_ID,
        payment_account_id=None,
    )
    _advance(db_session, entity_id, employee_id, drawer, 1_344_000, date(2026, 6, 8))

    result = staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 7, 6),
        cash_minor=1_000_000,
        period_year=2026,
        period_month=7,
        period_salary_minor=1_000_000,
        description="July salary",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    # Owed = 13.440 extra days + 10.000 July = 23.440; cash 10.000 →
    # 13.440 left owed, advance 13.440 clears it exactly.
    assert result.advance_applied_minor == 1_344_000
    with entity_context(db_session, entity_id):
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) == 0
        assert staff_ledger.remaining_accrual_minor(db_session, employee_id) == 0


def test_excess_cash_beyond_all_owed_parks_as_advance(db_session, staff_setup) -> None:
    """Only surplus beyond ALL debt parks — no more advance/re-advance loop."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    result = staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 30),
        cash_minor=1_100_000,
        period_year=2026,
        period_month=6,
        period_salary_minor=1_000_000,
        description="June salary",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    assert result.advance_applied_minor == 0
    with entity_context(db_session, entity_id):
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) == 100_000
        assert staff_ledger.remaining_accrual_minor(db_session, employee_id) == 0


def test_extra_days_owed_absorbs_cash_instead_of_becoming_advance(
    db_session, staff_setup
) -> None:
    """Root-cause guard: cash beyond the period settles extra-days owed first."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_extra_days_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 8),
        extra_days=7,
        per_day_minor=192_000,
        description="Extra days",
        actor_id=ACTOR_ID,
        payment_account_id=None,
    )
    result = staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 8),
        cash_minor=1_344_000,
        period_year=2026,
        period_month=6,
        period_salary_minor=1,  # negligible period salary
        description="Pay extra days",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    assert result.advance_applied_minor == 0
    with entity_context(db_session, entity_id):
        # Previously the whole 13.440 became a NEW advance; now it settles debt.
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) == 0


def test_extra_days_accrual_is_correctable_and_keeps_day_count(
    client, db_session, staff_setup
) -> None:
    """Edit extra days as days × rate — metadata must survive the correction."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]

    result = staff_posting.post_extra_days_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 8),
        extra_days=4,
        per_day_minor=95_000,
        description="Extra days (4 × 950.00 ₺/day)",
        actor_id=ACTOR_ID,
        payment_account_id=None,
    )
    journal_id = result.journal_entry.id

    resp = client.post(
        f"/entities/{entity_id}/staff/employees/{employee_id}"
        f"/ledger/{journal_id}/correct",
        json={
            "entry_date": "2026-06-08",
            "description": "Extra days (5 × 950.00 ₺/day)",
            "actor_id": str(ACTOR_ID),
            "extra_days": 5,
            "per_day_minor": 95_000,
        },
    )
    assert resp.status_code == 200, resp.text
    corrected = resp.json()["staff_ledger_entry"]
    assert corrected["extra_days"] == 5
    assert corrected["amount_minor"] == 475_000

    with entity_context(db_session, entity_id):
        # Owed follows the corrected figure, not the original 380_000.
        assert staff_ledger.remaining_accrual_minor(db_session, employee_id) == 475_000
