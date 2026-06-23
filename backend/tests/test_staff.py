"""Staff salary vs advance — GL control accounts, no double-count (Phase 5 Slice 3)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.core.chart_of_accounts.default_chart import (
    EMPLOYEE_ADVANCES_CODE,
    SALARIES_PAYABLE_CODE,
    SALARY_EXPENSE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx import ledger as fx_ledger
from app.core.fx import posting as fx_posting
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.core.staff import posting as staff_posting
from app.core.staff.models import StaffLedgerEntry
from app.core.staff.types import PayCurrency, StaffMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.staff.models import Employee


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def staff_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        employee = Employee(name="Ali Yilmaz", pay_currency=PayCurrency.TRY)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "accounts": accounts,
        "employee_id": employee.id,
    }


def _gl_balance(
    db_session,
    entity_id: uuid.UUID,
    account_id: uuid.UUID,
    normal: AccountNormalBalance,
) -> int:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.account_id == account_id)
            .group_by(JournalEntryLine.side)
        ).all()
        debits = credits = 0
        for side, total in rows:
            if side == AccountNormalBalance.DEBIT:
                debits = int(total or 0)
            else:
                credits = int(total or 0)
        if normal == AccountNormalBalance.CREDIT:
            return credits - debits
        return debits - credits


def _salary_expense_total(db_session, entity_id: uuid.UUID, account_id: uuid.UUID) -> int:
    return _gl_balance(db_session, entity_id, account_id, AccountNormalBalance.DEBIT)


def _subledger_balance(db_session, entity_id: uuid.UUID, employee_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        total = db_session.scalar(
            select(func.coalesce(func.sum(StaffLedgerEntry.amount_minor), 0)).where(
                StaffLedgerEntry.employee_id == employee_id
            )
        )
        return int(total or 0)


def test_try_accrual_posts_dr_5100_cr_2250(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    accounts = staff_setup["accounts"]

    result = staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=500_000,
        description="June salary",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry is not None
    assert result.journal_entry.source == JournalEntrySource.STAFF_ACCRUAL
    assert result.balance_minor == 500_000
    assert _salary_expense_total(db_session, entity_id, accounts[SALARY_EXPENSE_CODE]) == 500_000
    assert _gl_balance(
        db_session, entity_id, accounts[SALARIES_PAYABLE_CODE], AccountNormalBalance.CREDIT
    ) == 500_000
    assert _subledger_balance(db_session, entity_id, employee_id) == 500_000


def test_advance_dr_1300_no_expense(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    accounts = staff_setup["accounts"]
    drawer = staff_setup["drawer"]

    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 5),
        amount_minor=200_000,
        description="June avans",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    assert _salary_expense_total(db_session, entity_id, accounts[SALARY_EXPENSE_CODE]) == 0
    assert _gl_balance(
        db_session, entity_id, accounts[EMPLOYEE_ADVANCES_CODE], AccountNormalBalance.DEBIT
    ) == 200_000
    assert _subledger_balance(db_session, entity_id, employee_id) == -200_000


def test_salary_payment_no_second_5100_with_advance_offset(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    accounts = staff_setup["accounts"]
    drawer = staff_setup["drawer"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=500_000,
        description="June salary",
        actor_id=ACTOR_ID,
    )
    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 5),
        amount_minor=200_000,
        description="June avans",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    result = staff_posting.post_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 30),
        amount_minor=300_000,
        description="June pay",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    assert result.journal_entry.source == JournalEntrySource.STAFF_PAYMENT
    assert _salary_expense_total(db_session, entity_id, accounts[SALARY_EXPENSE_CODE]) == 500_000
    assert _gl_balance(
        db_session, entity_id, accounts[SALARIES_PAYABLE_CODE], AccountNormalBalance.CREDIT
    ) == 0
    assert _gl_balance(
        db_session, entity_id, accounts[EMPLOYEE_ADVANCES_CODE], AccountNormalBalance.DEBIT
    ) == 0
    assert _subledger_balance(db_session, entity_id, employee_id) == 0

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        expense_lines = [
            line
            for line in lines
            if line.account_id == accounts[SALARY_EXPENSE_CODE]
        ]
        assert expense_lines == []


def test_partial_salary_payment_applies_advance_only_once(db_session, staff_setup) -> None:
    """Phase 8.6 — two partial pays must not re-apply the same advance."""
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    accounts = staff_setup["accounts"]
    drawer = staff_setup["drawer"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=100_000_00,
        description="June salary",
        actor_id=ACTOR_ID,
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

    assert _gl_balance(
        db_session, entity_id, accounts[SALARIES_PAYABLE_CODE], AccountNormalBalance.CREDIT
    ) == 0
    assert _gl_balance(
        db_session, entity_id, accounts[EMPLOYEE_ADVANCES_CODE], AccountNormalBalance.DEBIT
    ) == 0
    assert _subledger_balance(db_session, entity_id, employee_id) == 0

    from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied

    assert_entity_control_accounts_tied(db_session, entity_id)


def test_fx_partial_salary_payment_applies_advance_only_once(db_session, staff_setup) -> None:
    """FX path — advance applied once across partial salary payments."""
    entity_id = staff_setup["entity_id"]
    accounts = staff_setup["accounts"]
    drawer = staff_setup["drawer"]

    usd_wallet = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency="USD",
            name="USD Wallet",
        ),
    )
    fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=usd_wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=200_000,
        try_cost_kurus=7_000_000,
        purchase_date=date(2026, 5, 1),
        description="Buy USD",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        employee = Employee(name="John FX", pay_currency=PayCurrency.USD)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
        employee_id = employee.id

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=100_000,
        description="USD salary",
        actor_id=ACTOR_ID,
    )
    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 5),
        amount_minor=50_000,
        description="USD avans",
        actor_id=ACTOR_ID,
        fx_money_account_id=usd_wallet.id,
        try_cost_kurus=1_750_000,
    )
    staff_posting.post_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 15),
        amount_minor=30_000,
        description="Partial FX pay 1",
        actor_id=ACTOR_ID,
        fx_money_account_id=usd_wallet.id,
        try_cost_kurus=1_050_000,
    )
    staff_posting.post_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 30),
        amount_minor=20_000,
        description="Partial FX pay 2",
        actor_id=ACTOR_ID,
        fx_money_account_id=usd_wallet.id,
        try_cost_kurus=700_000,
    )

    assert _gl_balance(
        db_session, entity_id, accounts[EMPLOYEE_ADVANCES_CODE], AccountNormalBalance.DEBIT
    ) == 0
    assert _subledger_balance(db_session, entity_id, employee_id) == 0

    from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied

    assert_entity_control_accounts_tied(db_session, entity_id)


def test_salary_payment_without_advance(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    accounts = staff_setup["accounts"]
    drawer = staff_setup["drawer"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=400_000,
        description="Salary",
        actor_id=ACTOR_ID,
    )
    staff_posting.post_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 30),
        amount_minor=400_000,
        description="Pay",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    assert _salary_expense_total(db_session, entity_id, accounts[SALARY_EXPENSE_CODE]) == 400_000
    assert _subledger_balance(db_session, entity_id, employee_id) == 0


def test_fx_accrual_subledger_only_no_gl(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    accounts = staff_setup["accounts"]

    with entity_context(db_session, entity_id):
        employee = Employee(name="John FX", pay_currency=PayCurrency.USD)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
        employee_id = employee.id

    result = staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=50_000,
        description="USD salary accrual",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry is None
    assert result.balance_minor == 50_000
    assert _salary_expense_total(db_session, entity_id, accounts[SALARY_EXPENSE_CODE]) == 0


def test_fx_salary_payment_expense_and_wallet_spend(db_session, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    accounts = staff_setup["accounts"]
    drawer = staff_setup["drawer"]

    usd_wallet = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency="USD",
            name="USD Wallet",
        ),
    )
    fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=usd_wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=100_000,
        try_cost_kurus=3_500_000,
        purchase_date=date(2026, 5, 1),
        description="Buy USD",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        employee = Employee(name="John FX", pay_currency=PayCurrency.USD)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
        employee_id = employee.id

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=50_000,
        description="USD salary",
        actor_id=ACTOR_ID,
    )

    result = staff_posting.post_salary_payment(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 6, 30),
        amount_minor=50_000,
        description="USD pay",
        actor_id=ACTOR_ID,
        fx_money_account_id=usd_wallet.id,
        try_cost_kurus=1_800_000,
    )

    assert result.fx_ledger_entry is not None
    assert result.fx_ledger_entry.native_quantity == -50_000
    assert result.fx_ledger_entry.try_cost_kurus == -1_800_000
    assert _salary_expense_total(db_session, entity_id, accounts[SALARY_EXPENSE_CODE]) == 1_800_000
    assert fx_ledger.native_quantity_balance(db_session, entity_id, usd_wallet.id) == 50_000
    assert fx_ledger.try_cost_balance_kurus(db_session, entity_id, usd_wallet.id) == 1_700_000
    assert _subledger_balance(db_session, entity_id, employee_id) == 0


def test_cross_entity_isolation(db_session, restaurant_a, restaurant_b, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]
    drawer = staff_setup["drawer"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=100_000,
        description="Salary",
        actor_id=ACTOR_ID,
    )

    seed_default_chart(db_session, restaurant_b.id)
    other_drawer = banking_service.create_money_account(
        db_session,
        restaurant_b.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Other Drawer"),
    )

    with pytest.raises(LookupError, match="Employee not found"):
        staff_posting.post_salary_payment(
            db_session,
            restaurant_b.id,
            employee_id,
            payment_date=date(2026, 6, 30),
            amount_minor=100_000,
            description="Cross entity",
            actor_id=ACTOR_ID,
            payment_account_id=other_drawer.gl_account_id,
        )

    with entity_context(db_session, restaurant_b.id):
        count = db_session.scalar(select(func.count()).select_from(StaffLedgerEntry))
        assert count == 0


def test_api_staff_flow(client: TestClient, staff_setup, db_session) -> None:
    entity_id = staff_setup["entity_id"]
    drawer = staff_setup["drawer"]
    base = f"/entities/{entity_id}/staff"

    emp = client.post(
        f"{base}/employees",
        json={"name": "Ayse Demir", "pay_currency": "TRY"},
    )
    assert emp.status_code == 201
    employee_id = emp.json()["id"]

    accrual = client.post(
        f"{base}/employees/{employee_id}/accruals",
        json={
            "accrual_date": "2026-06-01",
            "amount_minor": 450000,
            "description": "June salary",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert accrual.status_code == 201
    assert accrual.json()["journal_entry_id"]

    advance = client.post(
        f"{base}/employees/{employee_id}/advances",
        json={
            "payment_date": "2026-06-10",
            "amount_minor": 150000,
            "description": "Avans",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(drawer.gl_account_id),
        },
    )
    assert advance.status_code == 201

    payment = client.post(
        f"{base}/employees/{employee_id}/payments",
        json={
            "payment_date": "2026-06-30",
            "amount_minor": 300000,
            "description": "Final pay",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(drawer.gl_account_id),
        },
    )
    assert payment.status_code == 201
    assert payment.json()["balance_minor"] == 0

    ledger = client.get(f"{base}/employees/{employee_id}/ledger")
    assert ledger.status_code == 200
    assert ledger.json()["balance_minor"] == 0
    assert len(ledger.json()["entries"]) == 3


def test_rls_isolation_raw_sql(db_session, restaurant_a, restaurant_b, staff_setup) -> None:
    entity_id = staff_setup["entity_id"]
    employee_id = staff_setup["employee_id"]

    staff_posting.post_salary_accrual(
        db_session,
        entity_id,
        employee_id,
        accrual_date=date(2026, 6, 1),
        amount_minor=100_000,
        description="Salary",
        actor_id=ACTOR_ID,
    )

    db_session.execute(
        text("SELECT set_config('app.current_entity_id', :eid, true)"),
        {"eid": str(restaurant_b.id)},
    )
    rows = db_session.execute(
        text("SELECT id FROM staff_ledger_entries WHERE employee_id = :eid"),
        {"eid": str(employee_id)},
    ).all()
    assert rows == []
