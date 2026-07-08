"""Group-sale discount write-off (5800), staff advance return, and net-payment void gate."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_RECEIVABLE_CODE,
    EMPLOYEE_ADVANCES_CODE,
    GROUP_SALES_REVENUE_CODE,
    SALES_DISCOUNT_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables import posting as receivables_posting
from app.core.receivables.posting import InvalidReceivablePostingError
from app.core.staff import ledger as staff_ledger
from app.core.staff import posting as staff_posting
from app.core.staff.posting import InvalidStaffPostingError
from app.core.staff.types import PayCurrency
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.customers.models import Customer
from app.features.customers.schema import CustomerPaymentCreate
from app.features.customers import service as customers_service
from app.features.group_sales.models import GroupMenu, GroupSaleStatus
from app.features.group_sales.schema import GroupSaleCreate, GroupSaleLineInput
from app.features.group_sales import service as group_sales_service
from app.features.group_sales.service import GroupSaleError, GroupSaleHasPaymentsError
from app.features.staff.models import Employee


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        customer = Customer(name="Agency Tours Ltd")
        employee = Employee(name="Ali Yilmaz", pay_currency=PayCurrency.TRY)
        menu = GroupMenu(name="Set menu")
        db_session.add_all([customer, employee, menu])
        db_session.commit()
        db_session.refresh(customer)
        db_session.refresh(employee)
        db_session.refresh(menu)
        customer_id = customer.id
        employee_id = employee.id
        menu_id = menu.id
    fx_wallet = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency="USD",
            name="USD Wallet",
        ),
    )
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK, name="TRY Bank", bank_name="Test Bank"
        ),
    )
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    return {
        "entity_id": restaurant_a.id,
        "customer_id": customer_id,
        "employee_id": employee_id,
        "menu_id": menu_id,
        "fx_wallet": fx_wallet,
        "bank": bank,
        "drawer": drawer,
    }


def _gl_balance(db_session, entity_id, code: str, normal: AccountNormalBalance) -> int:
    with entity_context(db_session, entity_id):
        account = db_session.scalar(select(Account).where(Account.code == code))
        assert account is not None
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.account_id == account.id)
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


def _post_try_sale(db_session, setup, *, pax: int, rate: int, day: int):
    return group_sales_service.post_group_sale(
        db_session,
        setup["entity_id"],
        GroupSaleCreate(
            customer_id=setup["customer_id"],
            sale_date=date(2026, 9, day),
            description="Group booking",
            currency="TRY",
            actor_id=ACTOR_ID,
            lines=[
                GroupSaleLineInput(menu_name="Set menu", pax=pax, rate_per_person_minor=rate)
            ],
        ),
    )


# ---------- Discount write-off ----------


def test_discount_after_partial_payment_clears_ar(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    sale = _post_try_sale(db_session, setup, pax=10, rate=10_000, day=1)  # 100_000
    sale_id = sale.id

    customers_service.record_customer_payment(
        db_session,
        entity_id,
        setup["customer_id"],
        CustomerPaymentCreate(
            payment_date=date(2026, 9, 2),
            amount_kurus=80_000,
            description="Partial",
            actor_id=ACTOR_ID,
            payment_account_id=setup["bank"].gl_account_id,
            group_sale_id=sale_id,
        ),
    )

    group_sales_service.post_group_sale_discount(
        db_session, entity_id, sale_id, discount_kurus=20_000, actor_id=ACTOR_ID
    )

    assert _gl_balance(db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT) == 0
    assert _gl_balance(db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT) == 20_000


def test_discount_full_remaining_no_payment(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    sale = _post_try_sale(db_session, setup, pax=10, rate=10_000, day=3)  # 100_000

    group_sales_service.post_group_sale_discount(
        db_session, entity_id, sale.id, discount_kurus=100_000, actor_id=ACTOR_ID
    )

    assert _gl_balance(db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT) == 0
    assert _gl_balance(db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT) == 100_000


def test_discount_fx_clears_native_and_try(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    customer_id = setup["customer_id"]

    sale = group_sales_service.post_group_sale(
        db_session,
        entity_id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 9, 4),
            description="USD booking",
            currency="USD",
            fx_rate_used=3_500,
            actor_id=ACTOR_ID,
            lines=[GroupSaleLineInput(menu_name="Set", pax=19, rate_per_person_minor=1_000)],
        ),
    )
    sale_id = sale.id
    # 19_000 native @ 3_500 → 665_000 TRY

    customers_service.record_customer_payment(
        db_session,
        entity_id,
        customer_id,
        CustomerPaymentCreate(
            payment_date=date(2026, 9, 5),
            description="USD wire",
            actor_id=ACTOR_ID,
            payment_account_id=setup["fx_wallet"].gl_account_id,
            payment_native_quantity=18_000,
            group_sale_id=sale_id,
        ),
    )
    # clears 630_000 TRY, remaining 35_000 TRY / 1_000 native

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale_id,
        discount_kurus=35_000,
        discount_native=1_000,
        actor_id=ACTOR_ID,
    )

    assert _gl_balance(db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT) == 0
    assert _gl_balance(db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT) == 35_000
    native = group_sales_service.customer_forex_balance(db_session, entity_id, customer_id, "USD")
    assert native == 0


def test_discount_reverses_on_void(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    sale = _post_try_sale(db_session, setup, pax=10, rate=10_000, day=6)  # 100_000

    group_sales_service.post_group_sale_discount(
        db_session, entity_id, sale.id, discount_kurus=100_000, actor_id=ACTOR_ID
    )
    # No payment applied → void allowed; must reverse the discount too.
    voided = group_sales_service.void_group_sale(
        db_session, entity_id, sale.id, actor_id=ACTOR_ID, reason="cancel"
    )
    assert voided.status == GroupSaleStatus.VOIDED.value
    assert _gl_balance(db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT) == 0
    assert _gl_balance(db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT) == 0
    assert _gl_balance(db_session, entity_id, GROUP_SALES_REVENUE_CODE, AccountNormalBalance.CREDIT) == 0


def test_discount_exceeds_remaining_rejected(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    sale = _post_try_sale(db_session, setup, pax=10, rate=10_000, day=7)  # 100_000
    with pytest.raises(GroupSaleError):
        group_sales_service.post_group_sale_discount(
            db_session, entity_id, sale.id, discount_kurus=150_000, actor_id=ACTOR_ID
        )


# ---------- Staff advance return ----------


def _outstanding(db_session, entity_id, employee_id) -> int:
    with entity_context(db_session, entity_id):
        return staff_ledger.outstanding_advance_minor(db_session, employee_id)


def test_advance_return_reduces_outstanding(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    employee_id = setup["employee_id"]
    drawer = setup["drawer"]

    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 9, 1),
        amount_minor=200_000,
        description="Advance",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )
    assert _outstanding(db_session, entity_id, employee_id) == 200_000

    staff_posting.post_advance_returned(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 9, 10),
        amount_minor=50_000,
        description="Returned cash",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    assert _outstanding(db_session, entity_id, employee_id) == 150_000
    # 1300 Employee Advances: 200k debit - 50k credit = 150k net debit.
    assert _gl_balance(db_session, entity_id, EMPLOYEE_ADVANCES_CODE, AccountNormalBalance.DEBIT) == 150_000


def test_advance_return_exceeds_outstanding_rejected(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    employee_id = setup["employee_id"]
    drawer = setup["drawer"]

    staff_posting.post_advance_paid(
        db_session,
        entity_id,
        employee_id,
        payment_date=date(2026, 9, 1),
        amount_minor=100_000,
        description="Advance",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    with pytest.raises(InvalidStaffPostingError):
        staff_posting.post_advance_returned(
            db_session,
            entity_id,
            employee_id,
            payment_date=date(2026, 9, 10),
            amount_minor=150_000,
            description="Over-return",
            actor_id=ACTOR_ID,
            payment_account_id=drawer.gl_account_id,
        )


# ---------- Net-payment void gate ----------


def test_void_gate_reenables_after_payment_reversed(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    customer_id = setup["customer_id"]
    sale = _post_try_sale(db_session, setup, pax=10, rate=10_000, day=8)  # 100_000
    sale_id = sale.id

    payment = customers_service.record_customer_payment(
        db_session,
        entity_id,
        customer_id,
        CustomerPaymentCreate(
            payment_date=date(2026, 9, 9),
            amount_kurus=100_000,
            description="Full payment",
            actor_id=ACTOR_ID,
            payment_account_id=setup["bank"].gl_account_id,
            group_sale_id=sale_id,
        ),
    )

    # Live payment blocks void.
    with pytest.raises(GroupSaleHasPaymentsError):
        group_sales_service.void_group_sale(db_session, entity_id, sale_id, actor_id=ACTOR_ID)

    # Fully reverse the payment → net payment is zero.
    customers_service.void_customer_payment_entry(
        db_session,
        entity_id,
        customer_id,
        payment.journal_entry_id,
        actor_id=ACTOR_ID,
    )

    voided = group_sales_service.void_group_sale(
        db_session, entity_id, sale_id, actor_id=ACTOR_ID
    )
    assert voided.status == GroupSaleStatus.VOIDED.value


# ---------- Agency-level (customer) write-off ----------


def test_customer_write_off_clears_balance(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    customer_id = setup["customer_id"]
    _post_try_sale(db_session, setup, pax=10, rate=10_000, day=11)  # 100_000

    # Agency-level payment NOT linked to any sale (the real-world case).
    customers_service.record_customer_payment(
        db_session,
        entity_id,
        customer_id,
        CustomerPaymentCreate(
            payment_date=date(2026, 9, 12),
            amount_kurus=40_000,
            description="Partial",
            actor_id=ACTOR_ID,
            payment_account_id=setup["bank"].gl_account_id,
        ),
    )
    assert (
        receivables_ledger.current_balance_kurus(db_session, entity_id, customer_id)
        == 60_000
    )

    receivables_posting.post_customer_write_off(
        db_session,
        entity_id,
        customer_id,
        write_off_date=date(2026, 9, 13),
        amount_kurus=60_000,
        description="Write off",
        actor_id=ACTOR_ID,
    )

    assert (
        receivables_ledger.current_balance_kurus(db_session, entity_id, customer_id) == 0
    )
    assert _gl_balance(db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT) == 0
    assert _gl_balance(db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT) == 60_000


def test_customer_write_off_exceeds_balance_rejected(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    customer_id = setup["customer_id"]
    _post_try_sale(db_session, setup, pax=1, rate=10_000, day=14)  # 10_000

    with pytest.raises(InvalidReceivablePostingError):
        receivables_posting.post_customer_write_off(
            db_session,
            entity_id,
            customer_id,
            write_off_date=date(2026, 9, 15),
            amount_kurus=20_000,
            description="Too much",
            actor_id=ACTOR_ID,
        )
