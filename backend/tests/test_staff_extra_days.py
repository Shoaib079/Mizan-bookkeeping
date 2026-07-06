"""Extra days pay — days × rate posted to staff ledger and GL."""

from __future__ import annotations

from datetime import date

from app.core.staff.types import StaffMovementType
from app.db.session import entity_context
from app.features.staff.schema import StaffExtraDaysPaidCreate
from app.features.staff.service import get_staff_ledger, record_extra_days_paid

from tests.test_staff import ACTOR_ID, staff_setup


def test_extra_days_paid_posts_total_and_day_count(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    result = record_extra_days_paid(
        db_session,
        entity_id,
        employee_id,
        StaffExtraDaysPaidCreate(
            payment_date=date(2026, 5, 10),
            extra_days=3,
            per_day_minor=150_000,
            payment_account_id=drawer.gl_account_id,
            actor_id=ACTOR_ID,
        ),
    )

    assert result.total_minor == 450_000
    assert result.staff_ledger_entry.movement_type == StaffMovementType.EXTRA_DAYS_PAID
    assert result.staff_ledger_entry.extra_days == 3
    assert result.staff_ledger_entry.amount_minor == -450_000
    assert "3" in result.staff_ledger_entry.description

    ledger = get_staff_ledger(db_session, entity_id, employee_id)
    extra_rows = [
        row
        for row in ledger.entries
        if row.movement_type == StaffMovementType.EXTRA_DAYS_PAID
    ]
    assert len(extra_rows) == 1
    assert extra_rows[0].extra_days == 3


def test_extra_days_accrue_without_cash_payment(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]

    result = record_extra_days_paid(
        db_session,
        entity_id,
        employee_id,
        StaffExtraDaysPaidCreate(
            payment_date=date(2026, 5, 12),
            extra_days=2,
            per_day_minor=200_000,
            actor_id=ACTOR_ID,
        ),
    )

    assert result.total_minor == 400_000
    assert result.staff_ledger_entry.movement_type == StaffMovementType.EXTRA_DAYS_ACCRUED
    assert result.staff_ledger_entry.amount_minor == 400_000


def test_period_salary_accrual_only_without_cash(db_session, staff_setup) -> None:
    from app.features.staff.schema import StaffPaymentCreate
    from app.features.staff.service import record_payment

    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]

    result = record_payment(
        db_session,
        entity_id,
        employee_id,
        StaffPaymentCreate(
            payment_date=date(2026, 4, 30),
            amount_minor=0,
            description="April salary accrual",
            actor_id=ACTOR_ID,
            period_year=2026,
            period_month=4,
            period_salary_minor=3_400_000,
        ),
    )

    assert result.staff_ledger_entry.movement_type == StaffMovementType.SALARY_ACCRUED
    assert result.staff_ledger_entry.amount_minor == 3_400_000
    assert result.advance_applied_minor == 0


def test_extra_days_rejects_fx_employee(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    with entity_context(db_session, entity_id):
        from app.features.staff.models import Employee
        from app.core.staff.types import PayCurrency

        employee = db_session.get(Employee, employee_id)
        assert employee is not None
        employee.pay_currency = PayCurrency.USD
        db_session.commit()

    try:
        record_extra_days_paid(
            db_session,
            entity_id,
            employee_id,
            StaffExtraDaysPaidCreate(
                payment_date=date(2026, 5, 10),
                extra_days=2,
                per_day_minor=100_000,
                payment_account_id=drawer.gl_account_id,
                actor_id=ACTOR_ID,
            ),
        )
        raise AssertionError("expected ValueError for FX employee")
    except ValueError as exc:
        assert "TRY" in str(exc)
