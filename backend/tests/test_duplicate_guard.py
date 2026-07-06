"""Duplicate record guard — same date, amount, and kind."""

from __future__ import annotations

from datetime import date

import pytest

from app.core.duplicate_guard import (
    DuplicateRecordError,
    ensure_not_duplicate,
    find_duplicate_expense,
    find_duplicate_staff_movement,
)
from app.core.staff import posting as staff_posting
from app.core.staff.types import StaffMovementType
from app.db.session import entity_context
from app.features.expenses.service import create_expense
from app.features.expenses.schema import ExpenseCreate
from app.features.staff.schema import StaffPaymentCreate
from app.features.staff.service import record_payment

from tests.test_expenses import RENT_EXPENSE_CODE, expense_setup
from tests.test_staff import ACTOR_ID, staff_setup


def test_duplicate_expense_blocked_until_acknowledged(db_session, expense_setup) -> None:
    entity_id = expense_setup["entity_id"]
    drawer_id = expense_setup["drawer"].id
    account_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    payload = ExpenseCreate(
        expense_date=date(2026, 5, 10),
        amount_kurus=15_000,
        expense_account_id=account_id,
        money_account_id=drawer_id,
        description="Coffee",
        actor_id=ACTOR_ID,
    )
    create_expense(db_session, entity_id, payload)

    with entity_context(db_session, entity_id):
        match = find_duplicate_expense(
            db_session,
            expense_date=date(2026, 5, 10),
            amount_kurus=15_000,
            expense_account_id=account_id,
        )
    assert match is not None

    with pytest.raises(DuplicateRecordError):
        ensure_not_duplicate(match, acknowledged=False)

    ensure_not_duplicate(match, acknowledged=True)


def test_duplicate_staff_payment_blocked(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_period_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 5, 10),
        cash_minor=100_000,
        period_year=2026,
        period_month=5,
        period_salary_minor=3_400_000,
        description="May pay",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    with entity_context(db_session, entity_id):
        match = find_duplicate_staff_movement(
            db_session,
            employee_id=employee_id,
            movement_date=date(2026, 5, 10),
            amount_minor=-100_000,
            movement_type=StaffMovementType.SALARY_PAYMENT,
            period_year=2026,
            period_month=5,
        )
    assert match is not None

    with pytest.raises(DuplicateRecordError):
        record_payment(
            db_session,
            entity_id,
            employee_id,
            StaffPaymentCreate(
                payment_date=date(2026, 5, 10),
                amount_minor=100_000,
                description="May pay again",
                actor_id=ACTOR_ID,
                payment_account_id=drawer.gl_account_id,
                period_year=2026,
                period_month=5,
                period_salary_minor=3_400_000,
            ),
        )

    record_payment(
        db_session,
        entity_id,
        employee_id,
        StaffPaymentCreate(
            payment_date=date(2026, 5, 10),
            amount_minor=100_000,
            description="May pay again",
            actor_id=ACTOR_ID,
            payment_account_id=drawer.gl_account_id,
            period_year=2026,
            period_month=5,
            period_salary_minor=3_400_000,
            acknowledge_duplicate=True,
        ),
    )


def test_different_amount_not_duplicate_expense(db_session, expense_setup) -> None:
    entity_id = expense_setup["entity_id"]
    drawer_id = expense_setup["drawer"].id
    account_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    create_expense(
        db_session,
        entity_id,
        ExpenseCreate(
            expense_date=date(2026, 5, 10),
            amount_kurus=15_000,
            expense_account_id=account_id,
            money_account_id=drawer_id,
            description="Coffee",
            actor_id=ACTOR_ID,
        ),
    )

    with entity_context(db_session, entity_id):
        match = find_duplicate_expense(
            db_session,
            expense_date=date(2026, 5, 10),
            amount_kurus=20_000,
            expense_account_id=account_id,
        )
    assert match is None
