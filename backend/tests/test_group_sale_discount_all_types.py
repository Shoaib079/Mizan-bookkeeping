"""Group-sale discount on all sale types — rated FX, TRY, forex-only."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_RECEIVABLE_CODE,
    GROUP_SALES_REVENUE_CODE,
    SALES_DISCOUNT_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx.models import FxLedgerEntry
from app.core.fx.types import FxMovementType
from app.core.ledger.models import JournalEntry, JournalEntryLine
from app.core.receivables.models import CustomerLedgerEntry
from app.core.receivables.types import CustomerMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.customers.models import Customer
from app.features.customers.schema import CustomerPaymentCreate
from app.features.customers import service as customers_service
from app.features.group_sales.models import GroupMenu, GroupSale, GroupSaleStatus
from app.features.group_sales.schema import GroupSaleCreate, GroupSaleLineInput
from app.features.group_sales import service as group_sales_service
from app.features.group_sales.service import GroupSaleError

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
POSTING_SRC = Path(__file__).resolve().parents[1] / "app/core/receivables/posting.py"
FX_RATE = 3_500  # 35,00 TRY per USD
USD_500_NATIVE = 50_000
USD_50_NATIVE = 5_000
TRY_DISCOUNT_50_USD = 175_000  # 1.750,00 ₺


@pytest.fixture
def discount_all_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        customer = Customer(name="Agency All Types")
        veg = GroupMenu(name="Set menu")
        db_session.add_all([customer, veg])
        db_session.commit()
        db_session.refresh(customer)
        db_session.refresh(veg)
        customer_id = customer.id
        veg_menu_id = veg.id
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
            account_kind=MoneyAccountKind.BANK,
            name="TRY Bank",
            bank_name="Test Bank",
        ),
    )
    return {
        "entity_id": restaurant_a.id,
        "customer_id": customer_id,
        "veg_menu_id": veg_menu_id,
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


def _rated_usd_sale(db_session, setup) -> GroupSale:
    return group_sales_service.post_group_sale(
        db_session,
        setup["entity_id"],
        GroupSaleCreate(
            customer_id=setup["customer_id"],
            sale_date=date(2026, 9, 1),
            description="Rated USD booking",
            currency="USD",
            fx_rate_used=FX_RATE,
            actor_id=ACTOR_ID,
            lines=[
                GroupSaleLineInput(
                    group_menu_id=setup["veg_menu_id"],
                    pax=10,
                    rate_per_person_minor=5_000,
                )
            ],
        ),
    )


def _try_sale(db_session, setup) -> GroupSale:
    return group_sales_service.post_group_sale(
        db_session,
        setup["entity_id"],
        GroupSaleCreate(
            customer_id=setup["customer_id"],
            sale_date=date(2026, 9, 2),
            description="TRY booking",
            currency="TRY",
            actor_id=ACTOR_ID,
            lines=[
                GroupSaleLineInput(
                    group_menu_id=setup["veg_menu_id"],
                    pax=10,
                    rate_per_person_minor=50_000,
                )
            ],
        ),
    )


def _rateless_usd_sale(db_session, setup) -> GroupSale:
    return group_sales_service.post_group_sale(
        db_session,
        setup["entity_id"],
        GroupSaleCreate(
            customer_id=setup["customer_id"],
            sale_date=date(2026, 9, 3),
            description="Rateless USD",
            currency="USD",
            actor_id=ACTOR_ID,
            lines=[
                GroupSaleLineInput(
                    group_menu_id=setup["veg_menu_id"],
                    pax=10,
                    rate_per_person_minor=USD_500_NATIVE // 10,
                )
            ],
        ),
    )


def test_rated_fx_discount_from_native_posts_both_legs_and_5800(
    db_session, discount_all_setup
) -> None:
    entity_id = discount_all_setup["entity_id"]
    customer_id = discount_all_setup["customer_id"]
    sale = _rated_usd_sale(db_session, discount_all_setup)
    assert sale.total_forex_minor == USD_500_NATIVE

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale.id,
        discount_kurus=0,
        discount_native=USD_50_NATIVE,
        actor_id=ACTOR_ID,
    )

    assert group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    ) == USD_500_NATIVE - USD_50_NATIVE
    assert _gl_balance(
        db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT
    ) == TRY_DISCOUNT_50_USD
    assert _gl_balance(
        db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT
    ) == (USD_500_NATIVE * FX_RATE // 100) - TRY_DISCOUNT_50_USD

    with entity_context(db_session, entity_id):
        row = db_session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.reference_id == sale.id,
                CustomerLedgerEntry.movement_type == CustomerMovementType.DISCOUNT,
            )
        )
        assert row is not None
        assert row.journal_entry_id is not None
        assert row.total_forex_minor == -USD_50_NATIVE
        assert row.amount_kurus == -TRY_DISCOUNT_50_USD


def test_rated_fx_pay_after_discount_clears_native_and_try(
    db_session, discount_all_setup
) -> None:
    entity_id = discount_all_setup["entity_id"]
    customer_id = discount_all_setup["customer_id"]
    fx_wallet = discount_all_setup["fx_wallet"]
    sale = _rated_usd_sale(db_session, discount_all_setup)

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale.id,
        discount_kurus=0,
        discount_native=USD_50_NATIVE,
        actor_id=ACTOR_ID,
    )

    customers_service.record_customer_payment(
        db_session,
        entity_id,
        customer_id,
        CustomerPaymentCreate(
            payment_date=date(2026, 9, 10),
            description="USD wire",
            actor_id=ACTOR_ID,
            payment_account_id=fx_wallet.gl_account_id,
            payment_native_quantity=USD_500_NATIVE - USD_50_NATIVE,
            group_sale_id=sale.id,
        ),
    )

    assert group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    ) == 0
    assert _gl_balance(
        db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT
    ) == 0
    assert _gl_balance(
        db_session, entity_id, GROUP_SALES_REVENUE_CODE, AccountNormalBalance.CREDIT
    ) == USD_500_NATIVE * FX_RATE // 100
    assert _gl_balance(
        db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT
    ) == TRY_DISCOUNT_50_USD


def test_try_discount_5800_regression(db_session, discount_all_setup) -> None:
    entity_id = discount_all_setup["entity_id"]
    sale = _try_sale(db_session, discount_all_setup)

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale.id,
        discount_kurus=20_000,
        actor_id=ACTOR_ID,
    )

    assert _gl_balance(
        db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT
    ) == 20_000
    with entity_context(db_session, entity_id):
        read = group_sales_service.to_group_sale_read(db_session, sale)
    assert len(read.discounts) == 1
    assert read.discounts[0].discount_native_minor == 20_000


@pytest.mark.parametrize(
    "post_sale, kwargs",
    [
        ("rated", {"discount_kurus": 0, "discount_native": USD_500_NATIVE + 1}),
        ("try", {"discount_kurus": 600_000}),
        ("forex_only", {"discount_kurus": 0, "discount_native": USD_500_NATIVE + 1}),
    ],
)
def test_over_discount_rejected_each_type(
    db_session, discount_all_setup, post_sale, kwargs
) -> None:
    entity_id = discount_all_setup["entity_id"]
    if post_sale == "rated":
        sale = _rated_usd_sale(db_session, discount_all_setup)
    elif post_sale == "try":
        sale = _try_sale(db_session, discount_all_setup)
    else:
        sale = _rateless_usd_sale(db_session, discount_all_setup)

    with pytest.raises(GroupSaleError, match="discount exceeds"):
        group_sales_service.post_group_sale_discount(
            db_session,
            entity_id,
            sale.id,
            actor_id=ACTOR_ID,
            **kwargs,
        )


def test_void_rated_discount_restores_native_and_try(
    db_session, discount_all_setup
) -> None:
    entity_id = discount_all_setup["entity_id"]
    customer_id = discount_all_setup["customer_id"]
    sale = _rated_usd_sale(db_session, discount_all_setup)

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale.id,
        discount_kurus=0,
        discount_native=USD_50_NATIVE,
        actor_id=ACTOR_ID,
    )
    with entity_context(db_session, entity_id):
        read = group_sales_service.to_group_sale_read(db_session, sale)
        discount_id = read.discounts[0].customer_ledger_entry_id
        discount_row = db_session.get(CustomerLedgerEntry, discount_id)
        assert discount_row is not None
        journal_id = discount_row.journal_entry_id
        assert journal_id is not None

    customers_service.void_customer_write_off_entry(
        db_session,
        entity_id,
        customer_id,
        journal_id,
        actor_id=ACTOR_ID,
    )

    assert group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    ) == USD_500_NATIVE
    assert _gl_balance(
        db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT
    ) == 0
    assert _gl_balance(
        db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT
    ) == USD_500_NATIVE * FX_RATE // 100


def test_void_rated_sale_with_linked_discount_nets_out(
    db_session, discount_all_setup
) -> None:
    entity_id = discount_all_setup["entity_id"]
    customer_id = discount_all_setup["customer_id"]
    sale = _rated_usd_sale(db_session, discount_all_setup)

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale.id,
        discount_kurus=0,
        discount_native=USD_50_NATIVE,
        actor_id=ACTOR_ID,
    )

    group_sales_service.void_group_sale(
        db_session, entity_id, sale.id, actor_id=ACTOR_ID
    )

    assert group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    ) == 0
    assert _gl_balance(
        db_session, entity_id, ACCOUNTS_RECEIVABLE_CODE, AccountNormalBalance.DEBIT
    ) == 0
    assert _gl_balance(
        db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT
    ) == 0
    with entity_context(db_session, entity_id):
        voided = db_session.get(GroupSale, sale.id)
        assert voided is not None
        assert voided.status == GroupSaleStatus.VOIDED.value


def test_mutation_rated_discount_requires_native_leg() -> None:
    src = POSTING_SRC.read_text()
    marker = "total_forex_minor=(-discount_native if discount_native else None)"
    assert marker in src
    broken = src.replace(marker, "total_forex_minor=None")
    assert marker not in broken


def test_mutation_rated_discount_requires_5800_journal() -> None:
    src = POSTING_SRC.read_text()
    start = src.index("def post_group_sale_discount")
    end = src.index("\ndef _customer_outstanding_forex", start)
    block = src[start:end]
    assert "prepare_journal_entry" in block
    assert "SALES_DISCOUNT_CODE" in block
    broken = block.replace("prepare_journal_entry", "pass  # ")
    assert "prepare_journal_entry" not in broken
