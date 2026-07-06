"""Pay-at-time salary for a month — no separate accrual step (FS slice)."""

from __future__ import annotations

from datetime import date

import pytest

from app.core.chart_of_accounts.default_chart import (
    EMPLOYEE_ADVANCES_CODE,
    SALARIES_PAYABLE_CODE,
    SALARY_EXPENSE_CODE,
)
from app.core.staff import posting as staff_posting
from app.core.staff.ledger import (
    outstanding_advance_minor,
    period_accrued_minor,
    period_paid_minor,
    period_remaining_minor,
)
from app.core.staff.types import StaffMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.staff.models import Employee

from tests.test_staff import ACTOR_ID, staff_setup


def test_period_payment_accrues_and_pays_partial(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    result = staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 3, 15),
        cash_minor=500_000,
        period_year=2026,
        period_month=2,
        period_salary_minor=1_500_000,
        description="February salary part 1",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    assert result.advance_applied_minor == 0

    with entity_context(db_session, entity_id):
        assert period_accrued_minor(
            db_session, employee_id, period_year=2026, period_month=2
        ) == 1_500_000
        assert period_paid_minor(
            db_session, employee_id, period_year=2026, period_month=2
        ) == 500_000
        assert period_remaining_minor(
            db_session,
            employee_id,
            period_year=2026,
            period_month=2,
            period_salary_minor=1_500_000,
        ) == 1_000_000


def test_period_payment_second_partial(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 3, 1),
        cash_minor=500_000,
        period_year=2026,
        period_month=2,
        period_salary_minor=1_500_000,
        description="Feb part 1",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 3, 20),
        cash_minor=400_000,
        period_year=2026,
        period_month=2,
        period_salary_minor=1_500_000,
        description="Feb part 2",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    with entity_context(db_session, entity_id):
        assert period_paid_minor(
            db_session, employee_id, period_year=2026, period_month=2
        ) == 900_000


def test_period_payment_excess_becomes_advance(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 4, 30),
        cash_minor=1_600_000,
        period_year=2026,
        period_month=4,
        period_salary_minor=1_500_000,
        description="April salary + extra",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    with entity_context(db_session, entity_id):
        assert period_paid_minor(
            db_session, employee_id, period_year=2026, period_month=4
        ) == 1_500_000
        assert outstanding_advance_minor(db_session, employee_id) == 100_000


def test_period_payment_applies_existing_advance(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 5, 5),
        amount_minor=200_000,
        description="Avans",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    result = staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 5, 31),
        cash_minor=800_000,
        period_year=2026,
        period_month=5,
        period_salary_minor=1_000_000,
        description="May salary",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    assert result.advance_applied_minor == 200_000

    with entity_context(db_session, entity_id):
        assert period_paid_minor(
            db_session, employee_id, period_year=2026, period_month=5
        ) == 1_000_000
        assert outstanding_advance_minor(db_session, employee_id) == 0


def test_api_period_payment_without_prior_accrual(
    client, staff_setup, db_session
) -> None:
    entity_id = staff_setup["entity_id"]
    drawer = staff_setup["drawer"]

    with entity_context(db_session, entity_id):
        employee = Employee(name="Period Pay", pay_currency="TRY")
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
        employee_id = employee.id

    resp = client.post(
        f"/entities/{entity_id}/staff/employees/{employee_id}/payments",
        json={
            "payment_date": "2026-01-31",
            "amount_minor": 300000,
            "description": "January salary",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(drawer.gl_account_id),
            "period_year": 2026,
            "period_month": 1,
            "period_salary_minor": 1500000,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["balance_minor"] == 1_200_000

    status = client.get(
        f"/entities/{entity_id}/staff/employees/{employee_id}/salary-periods/2026/1"
    )
    assert status.status_code == 200
    body = status.json()
    assert body["period_paid_minor"] == 300_000
    assert body["period_remaining_minor"] == 1_200_000


def test_api_rejects_payment_without_period(client, staff_setup, db_session) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    resp = client.post(
        f"/entities/{entity_id}/staff/employees/{employee_id}/payments",
        json={
            "payment_date": "2026-06-30",
            "amount_minor": 300000,
            "description": "Legacy no-period pay",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(drawer.gl_account_id),
        },
    )
    assert resp.status_code == 422
