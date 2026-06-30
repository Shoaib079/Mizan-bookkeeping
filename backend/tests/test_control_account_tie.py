"""Control-account tie regression tests — Phase 8.6."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.payables import service as payables_service
from app.core.payables.types import SupplierMovementType
from app.core.staff import posting as staff_posting
from app.core.staff.types import PayCurrency
from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.staff.models import Employee
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def tie_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    return {"entity_id": restaurant_a.id, "drawer": drawer}


@pytest.fixture
def staff_employee(db_session, tie_setup):
    entity_id = tie_setup["entity_id"]
    with entity_context(db_session, entity_id):
        employee = Employee(name="Ali Yilmaz", pay_currency=PayCurrency.TRY)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
    return employee.id


def test_staff_control_accounts_tie_after_partial_payments_with_advance(
    db_session, tie_setup, staff_employee
) -> None:
    """Repro Phase 8.6 Item 1 — advance double-application breaks 2250/1300 ties."""
    entity_id = tie_setup["entity_id"]
    employee_id = staff_employee
    drawer = tie_setup["drawer"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=100_000_00,
        description="June salary",
        actor_id=ACTOR_ID,
        period_year=2026,
        period_month=6,
    )
    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 5),
        amount_minor=50_000_00,
        description="June avans",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    staff_posting.post_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 15),
        amount_minor=30_000_00,
        description="Partial pay 1",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    staff_posting.post_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 30),
        amount_minor=20_000_00,
        description="Partial pay 2",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    assert_entity_control_accounts_tied(db_session, entity_id)


def test_supplier_adjustment_api_ties_ap_control(db_session, restaurant_a) -> None:
    """Repro Phase 8.6 Item 2 — subledger-only adjustment leaves AP GL untied."""
    seed_default_chart(db_session, restaurant_a.id)
    supplier = supplier_service.create_supplier(
        db_session,
        restaurant_a.id,
        SupplierCreate(name="Metro Tedarik", vkn="1234567890"),
    )
    payables_service.record_movement(
        db_session,
        restaurant_a.id,
        supplier.id,
        movement_date=date(2026, 1, 15),
        movement_type=SupplierMovementType.ADJUSTMENT,
        amount_kurus=50_000_00,
        description="Manual AP adjustment",
        actor_id=ACTOR_ID,
    )

    assert_entity_control_accounts_tied(db_session, restaurant_a.id)
