"""Explicit apply-advance + cash-only salary payments (BUGLOG 2026-07-13).

Guards the decoupling: TRY salary payments never silently apply advances; the
explicit apply-advance action nets an outstanding advance against ALL unpaid
salary — regular accruals AND extra-days (previously invisible to advance
application, which made advances impossible to clear against extra-days owed).
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


def test_salary_payment_never_silently_applies_advance(db_session, staff_setup) -> None:
    """Owner report #2: 15.000 cash against 38.000 owed with 13.515 advance."""
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
    assert result.advance_applied_minor == 0
    with entity_context(db_session, entity_id):
        # Advance untouched; June still owes 38.000 − 15.000.
        assert staff_ledger.outstanding_advance_minor(db_session, employee_id) == 1_351_500
        assert staff_ledger.period_remaining_minor(
            db_session,
            employee_id,
            period_year=2026,
            period_month=6,
            period_salary_minor=3_800_000,
        ) == 2_300_000


def test_excess_cash_still_parks_as_advance(db_session, staff_setup) -> None:
    """Regression: paying more cash than the period owes still parks the excess."""
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
        assert staff_ledger.period_remaining_minor(
            db_session,
            employee_id,
            period_year=2026,
            period_month=6,
            period_salary_minor=1_000_000,
        ) == 0


def test_apply_advance_api_endpoint(client, db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    _accrue(db_session, entity_id, employee_id, 400_000, 2026, 6)
    _advance(db_session, entity_id, employee_id, drawer, 400_000, date(2026, 6, 5))

    resp = client.post(
        f"/entities/{entity_id}/staff/employees/{employee_id}/apply-advance",
        json={
            "applied_date": "2026-06-30",
            "description": "Apply advance",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert resp.status_code == 201
    assert resp.json()["advance_applied_minor"] == 400_000

    # Second apply: nothing left → 422.
    resp2 = client.post(
        f"/entities/{entity_id}/staff/employees/{employee_id}/apply-advance",
        json={
            "applied_date": "2026-06-30",
            "description": "Apply advance",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert resp2.status_code == 422
