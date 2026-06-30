"""PostgreSQL subledger immutability triggers — raw SQL bypass tests (Phase 8.6 Item 6)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.fx import posting as fx_posting
from app.core.payables import posting as payables_posting
from app.core.payables.types import SupplierMovementType
from app.core.staff import posting as staff_posting
from app.db.session import entity_context
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking import service as banking_service
from app.features.staff.models import Employee
from app.core.staff.types import PayCurrency
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def subledger_immutability_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Drawer"),
    )
    usd_wallet = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency="USD",
            name="USD",
        ),
    )
    supplier = supplier_service.create_supplier(
        db_session,
        restaurant_a.id,
        SupplierCreate(name="Metro", vkn="1234567890"),
    )
    supplier_id = supplier.id
    entity_id = restaurant_a.id
    with entity_context(db_session, entity_id):
        employee = Employee(name="Ali", pay_currency=PayCurrency.TRY)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
        employee_id = employee.id

    return {
        "entity_id": entity_id,
        "drawer": drawer,
        "usd_wallet": usd_wallet,
        "supplier_id": supplier_id,
        "employee_id": employee_id,
    }


@pytest.mark.parametrize(
    ("table", "setup_fn", "match"),
    [
        (
            "supplier_ledger_entries",
            "supplier_entry_id",
            "supplier ledger entries are immutable",
        ),
        (
            "staff_ledger_entries",
            "staff_entry_id",
            "staff ledger entries are immutable",
        ),
        (
            "fx_ledger_entries",
            "fx_entry_id",
            "fx ledger entries are immutable",
        ),
    ],
)
def test_raw_sql_update_subledger_entry_rejected(
    db_session,
    subledger_immutability_setup,
    table: str,
    setup_fn: str,
    match: str,
) -> None:
    entry_id = _seed_entry(db_session, subledger_immutability_setup, setup_fn)
    entity_id = subledger_immutability_setup["entity_id"]
    with entity_context(db_session, entity_id):
        with pytest.raises(DBAPIError, match=match):
            db_session.execute(
                text(f"UPDATE {table} SET description = :desc WHERE id = :id"),
                {"desc": "Tampered", "id": entry_id},
            )
            db_session.commit()
    db_session.rollback()


@pytest.mark.parametrize(
    ("table", "setup_fn", "match"),
    [
        (
            "supplier_ledger_entries",
            "supplier_entry_id",
            "supplier ledger entries are immutable",
        ),
        (
            "staff_ledger_entries",
            "staff_entry_id",
            "staff ledger entries are immutable",
        ),
        (
            "fx_ledger_entries",
            "fx_entry_id",
            "fx ledger entries are immutable",
        ),
    ],
)
def test_raw_sql_delete_subledger_entry_rejected(
    db_session,
    subledger_immutability_setup,
    table: str,
    setup_fn: str,
    match: str,
) -> None:
    entry_id = _seed_entry(db_session, subledger_immutability_setup, setup_fn)
    entity_id = subledger_immutability_setup["entity_id"]
    with entity_context(db_session, entity_id):
        with pytest.raises(DBAPIError, match=match):
            db_session.execute(
                text(f"DELETE FROM {table} WHERE id = :id"),
                {"id": entry_id},
            )
            db_session.commit()
    db_session.rollback()


def _seed_entry(db_session, setup: dict, kind: str) -> uuid.UUID:
    entity_id = setup["entity_id"]
    if kind == "supplier_entry_id":
        result = payables_posting.post_supplier_manual_movement(
            db_session,
            entity_id,
            setup["supplier_id"],
            movement_date=date(2026, 6, 1),
            amount_kurus=10_000,
            movement_type=SupplierMovementType.OPENING_BALANCE,
            description="Opening",
            actor_id=ACTOR_ID,
        )
        return result.supplier_ledger_entry.id

    if kind == "staff_entry_id":
        result = staff_posting.post_salary_accrual(
            db_session,
            entity_id,
            setup["employee_id"],
            accrual_date=date(2026, 6, 1),
            amount_minor=20_000,
            description="June accrual",
            actor_id=ACTOR_ID,
            period_year=2026,
            period_month=6,
        )
        return result.staff_ledger_entry.id

    if kind == "fx_entry_id":
        result = fx_posting.post_fx_purchase(
            db_session,
            entity_id,
            fx_money_account_id=setup["usd_wallet"].id,
            try_cash_money_account_id=setup["drawer"].id,
            native_quantity=1_000,
            try_cost_kurus=35_000,
            purchase_date=date(2026, 6, 1),
            description="USD buy",
            actor_id=ACTOR_ID,
        )
        return result.fx_ledger_entry.id

    raise ValueError(f"unknown setup kind: {kind}")
