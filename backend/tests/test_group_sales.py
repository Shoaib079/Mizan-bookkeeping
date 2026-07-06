"""Agency group sales v2 — menus, itemized TRY/FX bookings, void/edit, dashboard."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_RECEIVABLE_CODE,
    GROUP_SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx.models import FxLedgerEntry
from app.core.fx.types import FxMovementType
from app.core.ledger.models import JournalEntryLine
from app.core.receivables.models import CustomerLedgerEntry
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.customers.models import Customer
from app.features.customers.schema import CustomerPaymentCreate
from app.features.customers import service as customers_service
from app.features.dashboard import service as dashboard_service
from app.features.group_sales.models import GroupMenu, GroupSaleLine, GroupSaleStatus
from app.features.group_sales.models import GroupSale
from app.features.group_sales.schema import GroupMenuCreate, GroupSaleCreate, GroupSaleLineInput
from app.features.group_sales import service as group_sales_service
from app.features.group_sales.service import GroupSaleHasPaymentsError


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def group_sales_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a for a in db_session.scalars(select(Account)).all()}
        customer = Customer(name="Agency Tours Ltd")
        db_session.add(customer)
        db_session.commit()
        db_session.refresh(customer)
        veg = GroupMenu(name="Vegetarian menu")
        nonveg = GroupMenu(name="Non-veg menu")
        db_session.add_all([veg, nonveg])
        db_session.commit()
        db_session.refresh(veg)
        db_session.refresh(nonveg)
        customer_id = customer.id
        veg_menu_id = veg.id
        nonveg_menu_id = nonveg.id
    fx_wallet = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency="USD",
            name="USD Agency Wallet",
        ),
    )
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="TRY Bank",
            bank_name="Test Bank",
        ),
    )
    return {
        "entity_id": restaurant_a.id,
        "customer_id": customer_id,
        "veg_menu_id": veg_menu_id,
        "nonveg_menu_id": nonveg_menu_id,
        "accounts": accounts,
        "fx_wallet": fx_wallet,
        "bank": bank,
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


def test_seed_includes_4300(group_sales_setup) -> None:
    assert GROUP_SALES_REVENUE_CODE in group_sales_setup["accounts"]


def test_post_group_sale_try_multi_line(db_session, group_sales_setup) -> None:
    entity_id = group_sales_setup["entity_id"]
    customer_id = group_sales_setup["customer_id"]

    sale = group_sales_service.post_group_sale(
        db_session,
        entity_id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 8, 1),
            description="August tour lunch",
            currency="TRY",
            actor_id=ACTOR_ID,
            lines=[
                GroupSaleLineInput(
                    group_menu_id=group_sales_setup["veg_menu_id"],
                    pax=10,
                    rate_per_person_minor=50_000,
                ),
                GroupSaleLineInput(
                    group_menu_id=group_sales_setup["nonveg_menu_id"],
                    pax=5,
                    rate_per_person_minor=60_000,
                ),
            ],
        ),
    )

    assert sale.total_kurus == 800_000
    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(GroupSaleLine).where(GroupSaleLine.group_sale_id == sale.id)
        ).all()
        assert len(lines) == 2

    assert _gl_balance(db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT) == 800_000
    assert _gl_balance(
        db_session, entity_id, GROUP_SALES_REVENUE_CODE, AccountNormalBalance.CREDIT
    ) == 800_000


def test_post_group_sale_fx_native_receivable(db_session, group_sales_setup) -> None:
    entity_id = group_sales_setup["entity_id"]
    customer_id = group_sales_setup["customer_id"]

    sale = group_sales_service.post_group_sale(
        db_session,
        entity_id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 8, 2),
            description="USD group booking",
            currency="USD",
            fx_rate_used=3_500,
            actor_id=ACTOR_ID,
            lines=[
                GroupSaleLineInput(menu_name="Veg", pax=10, rate_per_person_minor=1_200),
                GroupSaleLineInput(menu_name="Non-veg", pax=5, rate_per_person_minor=1_400),
            ],
        ),
    )

    assert sale.total_forex_minor == 19_000
    assert sale.total_kurus == 665_000
    with entity_context(db_session, entity_id):
        ledger = db_session.get(CustomerLedgerEntry, sale.customer_ledger_entry_id)
        assert ledger is not None
        assert ledger.forex_currency == "USD"
        assert ledger.total_forex_minor == 19_000

    native = group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    )
    assert native == 19_000


def test_fx_wallet_payment_clears_native_without_payment_rate(
    db_session, group_sales_setup
) -> None:
    entity_id = group_sales_setup["entity_id"]
    customer_id = group_sales_setup["customer_id"]
    fx_wallet = group_sales_setup["fx_wallet"]

    sale = group_sales_service.post_group_sale(
        db_session,
        entity_id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 8, 3),
            description="USD booking",
            currency="USD",
            fx_rate_used=3_500,
            actor_id=ACTOR_ID,
            lines=[GroupSaleLineInput(menu_name="Set menu", pax=20, rate_per_person_minor=900)],
        ),
    )

    result = customers_service.record_customer_payment(
        db_session,
        entity_id,
        customer_id,
        CustomerPaymentCreate(
            payment_date=date(2026, 8, 10),
            description="USD wire",
            actor_id=ACTOR_ID,
            payment_account_id=fx_wallet.gl_account_id,
            payment_native_quantity=18_000,
            group_sale_id=sale.id,
        ),
    )

    assert result.balance_kurus == 0
    native = group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    )
    assert native == 0

    with entity_context(db_session, entity_id):
        fx_row = db_session.scalar(
            select(FxLedgerEntry).where(
                FxLedgerEntry.journal_entry_id == result.journal_entry_id
            )
        )
        assert fx_row is not None
        assert fx_row.movement_type == FxMovementType.RECEIPT
        assert fx_row.native_quantity == 18_000
        assert fx_row.try_cost_kurus == 630_000


def test_void_group_sale_reverses_gl(db_session, group_sales_setup) -> None:
    entity_id = group_sales_setup["entity_id"]
    customer_id = group_sales_setup["customer_id"]

    sale = group_sales_service.post_group_sale(
        db_session,
        entity_id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 8, 4),
            description="To void",
            currency="TRY",
            actor_id=ACTOR_ID,
            lines=[GroupSaleLineInput(menu_name="Lunch", pax=8, rate_per_person_minor=25_000)],
        ),
    )

    voided = group_sales_service.void_group_sale(
        db_session, entity_id, sale.id, actor_id=ACTOR_ID, reason="Wrong pax"
    )
    assert voided.status == GroupSaleStatus.VOIDED.value
    assert _gl_balance(db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT) == 0


def test_void_blocked_after_payment(db_session, group_sales_setup) -> None:
    entity_id = group_sales_setup["entity_id"]
    customer_id = group_sales_setup["customer_id"]
    bank = group_sales_setup["bank"]

    sale = group_sales_service.post_group_sale(
        db_session,
        entity_id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 8, 5),
            description="Paid sale",
            currency="TRY",
            actor_id=ACTOR_ID,
            lines=[GroupSaleLineInput(menu_name="Lunch", pax=4, rate_per_person_minor=20_000)],
        ),
    )
    sale_id = sale.id

    customers_service.record_customer_payment(
        db_session,
        entity_id,
        customer_id,
        CustomerPaymentCreate(
            payment_date=date(2026, 8, 6),
            amount_kurus=80_000,
            description="Partial",
            actor_id=ACTOR_ID,
            payment_account_id=bank.gl_account_id,
            group_sale_id=sale_id,
        ),
    )

    with pytest.raises(GroupSaleHasPaymentsError):
        group_sales_service.void_group_sale(
            db_session, entity_id, sale_id, actor_id=ACTOR_ID
        )


def test_correct_group_sale_void_and_repost(db_session, group_sales_setup) -> None:
    entity_id = group_sales_setup["entity_id"]
    customer_id = group_sales_setup["customer_id"]

    original = group_sales_service.post_group_sale(
        db_session,
        entity_id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 8, 6),
            description="Original",
            currency="TRY",
            actor_id=ACTOR_ID,
            lines=[GroupSaleLineInput(menu_name="Lunch", pax=10, rate_per_person_minor=10_000)],
        ),
    )

    corrected = group_sales_service.correct_group_sale(
        db_session,
        entity_id,
        original.id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 8, 6),
            description="Corrected pax",
            currency="TRY",
            actor_id=ACTOR_ID,
            lines=[GroupSaleLineInput(menu_name="Lunch", pax=12, rate_per_person_minor=10_000)],
        ),
    )

    with entity_context(db_session, entity_id):
        old = db_session.get(GroupSale, original.id)
        assert old is not None
        assert old.status == GroupSaleStatus.AMENDED.value
        assert old.amended_by_group_sale_id == corrected.id
        assert corrected.amends_group_sale_id == original.id
        assert corrected.total_kurus == 120_000


def test_dashboard_includes_4300(db_session, group_sales_setup) -> None:
    entity_id = group_sales_setup["entity_id"]
    customer_id = group_sales_setup["customer_id"]

    group_sales_service.post_group_sale(
        db_session,
        entity_id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 8, 7),
            description="Dashboard sale",
            currency="TRY",
            actor_id=ACTOR_ID,
            lines=[GroupSaleLineInput(menu_name="Tour", pax=5, rate_per_person_minor=30_000)],
        ),
    )

    dash = dashboard_service.get_dashboard(
        db_session, entity_id, date(2026, 8, 1), date(2026, 8, 31)
    )
    assert dash.sales.group_sales_kurus == 150_000
    assert dash.sales.total_sales_kurus == 150_000
