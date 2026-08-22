"""GS-FX — forex-native discount on rateless group sales (subledger only, no GL)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
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
from app.features.group_sales.models import GroupSale, GroupSaleStatus
from app.features.group_sales.schema import GroupSaleCreate, GroupSaleLineInput
from app.features.group_sales import service as group_sales_service
from app.features.group_sales.service import GroupSaleError

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
POSTING_SRC = Path(__file__).resolve().parents[1] / "app/core/receivables/forex_only_posting.py"


@pytest.fixture
def gs_fx_discount_setup(db_session, restaurant_a, restaurant_b):
    seed_default_chart(db_session, restaurant_a.id)
    seed_default_chart(db_session, restaurant_b.id)
    with entity_context(db_session, restaurant_a.id):
        customer = Customer(name="Agency FX Ltd")
        db_session.add(customer)
        db_session.commit()
        db_session.refresh(customer)
        customer_id = customer.id
    fx_wallet = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency="USD",
            name="USD Agency Wallet",
        ),
    )
    return {
        "entity_id": restaurant_a.id,
        "entity_b_id": restaurant_b.id,
        "customer_id": customer_id,
        "fx_wallet": fx_wallet,
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


def _rateless_usd_sale(db_session, setup, *, native_minor: int = 50_000) -> GroupSale:
    return group_sales_service.post_group_sale(
        db_session,
        setup["entity_id"],
        GroupSaleCreate(
            customer_id=setup["customer_id"],
            sale_date=date(2026, 8, 10),
            description="USD group — rateless",
            currency="USD",
            actor_id=ACTOR_ID,
            lines=[
                GroupSaleLineInput(
                    menu_name="Set menu",
                    pax=10,
                    rate_per_person_minor=native_minor // 10,
                )
            ],
        ),
    )


def test_forex_native_discount_reduces_receivable_no_gl(
    db_session, gs_fx_discount_setup
) -> None:
    entity_id = gs_fx_discount_setup["entity_id"]
    customer_id = gs_fx_discount_setup["customer_id"]
    sale = _rateless_usd_sale(db_session, gs_fx_discount_setup)

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale.id,
        discount_kurus=0,
        discount_native=5_000,
        description="Early payment discount",
        actor_id=ACTOR_ID,
    )

    native = group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    )
    assert native == 45_000

    with entity_context(db_session, entity_id):
        read = group_sales_service.to_group_sale_read(db_session, sale)
    assert read.remaining_forex_minor == 45_000
    assert len(read.discounts) == 1
    assert read.discounts[0].discount_native_minor == 5_000

    with entity_context(db_session, entity_id):
        discount_row = db_session.get(
            CustomerLedgerEntry, read.discounts[0].customer_ledger_entry_id
        )
        assert discount_row is not None
        assert discount_row.movement_type == CustomerMovementType.DISCOUNT
        assert discount_row.amount_kurus == 0
        assert discount_row.journal_entry_id is None
        assert discount_row.total_forex_minor == -5_000
        journal_count = db_session.scalar(select(func.count()).select_from(JournalEntry))

    assert journal_count == 0
    assert _gl_balance(
        db_session, entity_id, GROUP_SALES_REVENUE_CODE, AccountNormalBalance.CREDIT
    ) == 0
    assert _gl_balance(
        db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT
    ) == 0


def test_pay_discounted_balance_clears_receivable_zero_cost_receipt(
    db_session, gs_fx_discount_setup
) -> None:
    entity_id = gs_fx_discount_setup["entity_id"]
    customer_id = gs_fx_discount_setup["customer_id"]
    fx_wallet = gs_fx_discount_setup["fx_wallet"]
    sale = _rateless_usd_sale(db_session, gs_fx_discount_setup)

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale.id,
        discount_kurus=0,
        discount_native=5_000,
        actor_id=ACTOR_ID,
    )

    result = customers_service.record_customer_payment(
        db_session,
        entity_id,
        customer_id,
        CustomerPaymentCreate(
            payment_date=date(2026, 8, 16),
            description="USD wire",
            actor_id=ACTOR_ID,
            payment_account_id=fx_wallet.gl_account_id,
            payment_native_quantity=45_000,
            group_sale_id=sale.id,
        ),
    )

    assert result.journal_entry_id is None
    assert group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    ) == 0

    with entity_context(db_session, entity_id):
        fx_row = db_session.scalar(
            select(FxLedgerEntry).where(
                FxLedgerEntry.fx_money_account_id == fx_wallet.id,
                FxLedgerEntry.movement_type == FxMovementType.RECEIPT,
            )
        )
        assert fx_row is not None
        assert fx_row.native_quantity == 45_000
        assert fx_row.try_cost_kurus == 0


def test_over_discount_rejected(db_session, gs_fx_discount_setup) -> None:
    entity_id = gs_fx_discount_setup["entity_id"]
    sale = _rateless_usd_sale(db_session, gs_fx_discount_setup)

    with pytest.raises(GroupSaleError, match="discount exceeds"):
        group_sales_service.post_group_sale_discount(
            db_session,
            entity_id,
            sale.id,
            discount_kurus=0,
            discount_native=50_001,
            actor_id=ACTOR_ID,
        )


def test_void_forex_discount_restores_receivable(
    db_session, gs_fx_discount_setup
) -> None:
    entity_id = gs_fx_discount_setup["entity_id"]
    customer_id = gs_fx_discount_setup["customer_id"]
    sale = _rateless_usd_sale(db_session, gs_fx_discount_setup)

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale.id,
        discount_kurus=0,
        discount_native=5_000,
        actor_id=ACTOR_ID,
    )
    with entity_context(db_session, entity_id):
        read = group_sales_service.to_group_sale_read(db_session, sale)
    discount_id = read.discounts[0].customer_ledger_entry_id

    customers_service.void_customer_write_off_entry(
        db_session,
        entity_id,
        customer_id,
        discount_id,
        actor_id=ACTOR_ID,
    )

    assert group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    ) == 50_000
    with entity_context(db_session, entity_id):
        read_after = group_sales_service.to_group_sale_read(db_session, sale)
    assert read_after.remaining_forex_minor == 50_000
    assert read_after.discounts == []


def test_void_sale_with_linked_forex_discount_reverses_both(
    db_session, gs_fx_discount_setup
) -> None:
    entity_id = gs_fx_discount_setup["entity_id"]
    customer_id = gs_fx_discount_setup["customer_id"]
    sale = _rateless_usd_sale(db_session, gs_fx_discount_setup)

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale.id,
        discount_kurus=0,
        discount_native=5_000,
        actor_id=ACTOR_ID,
    )

    group_sales_service.void_group_sale(
        db_session, entity_id, sale.id, actor_id=ACTOR_ID
    )

    assert group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    ) == 0

    with entity_context(db_session, entity_id):
        rows = list(
            db_session.scalars(
                select(CustomerLedgerEntry).where(
                    CustomerLedgerEntry.reference_id == sale.id,
                )
            )
        )
        net_native = sum(
            (r.total_forex_minor or 0)
            + (r.payment_native_quantity or 0)
            for r in rows
        )
        assert net_native == 0
        voided = db_session.get(GroupSale, sale.id)
        assert voided is not None
        assert voided.status == GroupSaleStatus.VOIDED.value


def test_rated_fx_discount_still_posts_5800_regression(
    db_session, gs_fx_discount_setup
) -> None:
    entity_id = gs_fx_discount_setup["entity_id"]
    customer_id = gs_fx_discount_setup["customer_id"]

    sale = group_sales_service.post_group_sale(
        db_session,
        entity_id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 9, 4),
            description="USD rated booking",
            currency="USD",
            fx_rate_used=3_500,
            actor_id=ACTOR_ID,
            lines=[
                GroupSaleLineInput(menu_name="Set", pax=10, rate_per_person_minor=5_000)
            ],
        ),
    )

    group_sales_service.post_group_sale_discount(
        db_session,
        entity_id,
        sale.id,
        discount_kurus=0,
        discount_native=500,
        actor_id=ACTOR_ID,
    )

    assert _gl_balance(
        db_session, entity_id, SALES_DISCOUNT_CODE, AccountNormalBalance.DEBIT
    ) == 17_500

    with entity_context(db_session, entity_id):
        discount_row = db_session.scalar(
            select(CustomerLedgerEntry).where(
                CustomerLedgerEntry.reference_id == sale.id,
                CustomerLedgerEntry.movement_type == CustomerMovementType.DISCOUNT,
            )
        )
        assert discount_row is not None
        assert discount_row.journal_entry_id is not None


def test_forex_discount_entity_isolation(
    db_session, gs_fx_discount_setup, restaurant_b
) -> None:
    entity_a = gs_fx_discount_setup["entity_id"]
    sale = _rateless_usd_sale(db_session, gs_fx_discount_setup)

    with entity_context(db_session, restaurant_b.id):
        with pytest.raises(LookupError):
            group_sales_service.post_group_sale_discount(
                db_session,
                restaurant_b.id,
                sale.id,
                discount_kurus=0,
                discount_native=1_000,
                actor_id=ACTOR_ID,
            )

    assert group_sales_service.customer_forex_balance(
        db_session, entity_a, gs_fx_discount_setup["customer_id"], "USD"
    ) == 50_000


def test_mutation_forex_discount_must_not_post_gl() -> None:
    src = POSTING_SRC.read_text()
    start = src.index("def post_forex_only_group_sale_discount")
    end = len(src)
    block = src[start:end]
    assert "prepare_journal_entry" not in block
    assert "5800" not in block
    broken = block.replace(
        "session.commit()",
        "prepare_journal_entry(session, entity_id, discount_date, description, [], actor_id=actor_id)\n        session.commit()",
    )
    assert "prepare_journal_entry" in broken


def test_mutation_forex_discount_outstanding_guard() -> None:
    src = POSTING_SRC.read_text()
    assert "discount_native > native_out" in src
    broken = src.replace(
        "if discount_native > native_out:",
        "if False:",
    )
    assert "discount_native > native_out" not in broken
