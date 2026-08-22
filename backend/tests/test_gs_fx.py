"""GS-FX — forex-only group sales (DECISIONS 2026-07-13).

Rateless forex receivable → zero-cost wallet receipt → TRY at conversion.
"""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    FX_GAIN_CODE,
    GROUP_SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx.models import FxLedgerEntry
from app.core.fx.types import FxMovementType
from app.core.fx import spend_posting as fx_spend
from app.core.ledger.models import JournalEntry, JournalEntryLine
from app.core.receivables.models import CustomerLedgerEntry
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


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
POSTING_SRC = Path(__file__).resolve().parents[1] / "app/core/receivables/forex_only_posting.py"


@pytest.fixture
def gs_fx_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
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


def test_rateless_usd_group_sale_subledger_only_no_gl(db_session, gs_fx_setup) -> None:
    entity_id = gs_fx_setup["entity_id"]
    sale = _rateless_usd_sale(db_session, gs_fx_setup)

    assert sale.total_kurus == 0
    assert sale.total_forex_minor == 50_000
    assert sale.fx_rate_used is None
    assert sale.journal_entry_id is None

    with entity_context(db_session, entity_id):
        ledger = db_session.get(CustomerLedgerEntry, sale.customer_ledger_entry_id)
        assert ledger is not None
        assert ledger.amount_kurus == 0
        assert ledger.journal_entry_id is None
        assert ledger.forex_currency == "USD"
        assert ledger.total_forex_minor == 50_000
        journal_count = db_session.scalar(select(func.count()).select_from(JournalEntry))

    assert journal_count == 0
    assert _gl_balance(
        db_session, entity_id, GROUP_SALES_REVENUE_CODE, AccountNormalBalance.CREDIT
    ) == 0

    native = group_sales_service.customer_forex_balance(
        db_session, entity_id, gs_fx_setup["customer_id"], "USD"
    )
    assert native == 50_000


def test_forex_only_payment_zero_cost_wallet_no_revenue(
    db_session, gs_fx_setup
) -> None:
    entity_id = gs_fx_setup["entity_id"]
    customer_id = gs_fx_setup["customer_id"]
    fx_wallet = gs_fx_setup["fx_wallet"]
    sale = _rateless_usd_sale(db_session, gs_fx_setup)

    result = customers_service.record_customer_payment(
        db_session,
        entity_id,
        customer_id,
        CustomerPaymentCreate(
            payment_date=date(2026, 8, 15),
            description="USD wire",
            actor_id=ACTOR_ID,
            payment_account_id=fx_wallet.gl_account_id,
            payment_native_quantity=50_000,
            group_sale_id=sale.id,
        ),
    )

    assert result.journal_entry_id is None
    assert result.balance_kurus == 0
    native = group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    )
    assert native == 0

    with entity_context(db_session, entity_id):
        fx_row = db_session.scalar(
            select(FxLedgerEntry).where(
                FxLedgerEntry.fx_money_account_id == fx_wallet.id,
                FxLedgerEntry.movement_type == FxMovementType.RECEIPT,
            )
        )
        assert fx_row is not None
        assert fx_row.native_quantity == 50_000
        assert fx_row.try_cost_kurus == 0
        assert fx_row.journal_entry_id is None

    assert _gl_balance(
        db_session, entity_id, GROUP_SALES_REVENUE_CODE, AccountNormalBalance.CREDIT
    ) == 0


def test_zero_cost_conversion_full_proceeds_to_fx_gain(
    db_session, gs_fx_setup
) -> None:
    entity_id = gs_fx_setup["entity_id"]
    customer_id = gs_fx_setup["customer_id"]
    fx_wallet = gs_fx_setup["fx_wallet"]
    bank = gs_fx_setup["bank"]
    sale = _rateless_usd_sale(db_session, gs_fx_setup)

    customers_service.record_customer_payment(
        db_session,
        entity_id,
        customer_id,
        CustomerPaymentCreate(
            payment_date=date(2026, 8, 15),
            description="USD wire",
            actor_id=ACTOR_ID,
            payment_account_id=fx_wallet.gl_account_id,
            payment_native_quantity=50_000,
            group_sale_id=sale.id,
        ),
    )

    result = fx_spend.post_fx_conversion(
        db_session,
        entity_id,
        fx_money_account_id=fx_wallet.id,
        try_money_account_id=bank.id,
        native_quantity=50_000,
        try_received_kurus=2_000_000,
        conversion_date=date(2026, 8, 20),
        description="Convert agency USD",
        actor_id=ACTOR_ID,
    )

    assert result.try_cost_kurus == 0
    assert result.realized_gain_kurus == 2_000_000
    assert _gl_balance(db_session, entity_id, FX_GAIN_CODE, AccountNormalBalance.CREDIT) == 2_000_000


def test_void_rateless_group_sale_reverses_subledger_only(
    db_session, gs_fx_setup
) -> None:
    entity_id = gs_fx_setup["entity_id"]
    sale = _rateless_usd_sale(db_session, gs_fx_setup)

    voided = group_sales_service.void_group_sale(
        db_session, entity_id, sale.id, actor_id=ACTOR_ID, reason="Wrong pax"
    )
    assert voided.status == GroupSaleStatus.VOIDED.value

    native = group_sales_service.customer_forex_balance(
        db_session, entity_id, gs_fx_setup["customer_id"], "USD"
    )
    assert native == 0
    with entity_context(db_session, entity_id):
        assert db_session.scalar(select(func.count()).select_from(JournalEntry)) == 0


def test_correct_rateless_group_sale_void_and_repost(
    db_session, gs_fx_setup
) -> None:
    entity_id = gs_fx_setup["entity_id"]
    customer_id = gs_fx_setup["customer_id"]
    original = _rateless_usd_sale(db_session, gs_fx_setup)

    original_id = original.id
    corrected = group_sales_service.correct_group_sale(
        db_session,
        entity_id,
        original_id,
        GroupSaleCreate(
            customer_id=customer_id,
            sale_date=date(2026, 8, 10),
            description="USD group — corrected pax",
            currency="USD",
            actor_id=ACTOR_ID,
            lines=[
                GroupSaleLineInput(
                    menu_name="Set menu",
                    pax=12,
                    rate_per_person_minor=4_000,
                )
            ],
        ),
    )

    assert corrected.total_forex_minor == 48_000
    assert corrected.amends_group_sale_id == original_id
    assert corrected.journal_entry_id is None

    with entity_context(db_session, entity_id):
        original_row = db_session.get(GroupSale, original_id)
        assert original_row is not None
        assert original_row.status == GroupSaleStatus.AMENDED.value

    native = group_sales_service.customer_forex_balance(
        db_session, entity_id, customer_id, "USD"
    )
    assert native == 48_000


def test_entity_isolation_forex_group_sale(db_session, restaurant_a, restaurant_b) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    seed_default_chart(db_session, restaurant_b.id)
    with entity_context(db_session, restaurant_a.id):
        customer_a = Customer(name="Agency A")
        db_session.add(customer_a)
        db_session.commit()
        customer_a_id = customer_a.id
    with entity_context(db_session, restaurant_b.id):
        customer_b = Customer(name="Agency B")
        db_session.add(customer_b)
        db_session.commit()
        customer_b_id = customer_b.id

    sale_a = group_sales_service.post_group_sale(
        db_session,
        restaurant_a.id,
        GroupSaleCreate(
            customer_id=customer_a_id,
            sale_date=date(2026, 8, 11),
            description="A only",
            currency="USD",
            actor_id=ACTOR_ID,
            lines=[GroupSaleLineInput(menu_name="Lunch", pax=5, rate_per_person_minor=1_000)],
        ),
    )

    with entity_context(db_session, restaurant_b.id):
        b_sales = list(
            db_session.scalars(select(GroupSale).where(GroupSale.id == sale_a.id))
        )
        assert b_sales == []



def test_mutation_post_forex_only_must_not_prepare_journal() -> None:
    src = POSTING_SRC.read_text()
    start = src.index("def post_forex_only_credit_sale")
    end = src.index("def post_forex_only_customer_payment")
    block = src[start:end]
    assert "prepare_journal_entry" not in block
    broken = block.replace(
        "session.commit()",
        "prepare_journal_entry(session, entity_id, sale_date, description, [], actor_id=actor_id)\n        session.commit()",
    )
    assert "prepare_journal_entry" in broken


def test_mutation_zero_cost_receipt_required() -> None:
    src = POSTING_SRC.read_text()
    assert "try_cost_kurus=0" in src
    assert "journal_entry_id=None" in src
    broken = src.replace("try_cost_kurus=0", "try_cost_kurus=1")
    assert "try_cost_kurus=0" not in broken
