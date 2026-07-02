"""Profit & Loss and Balance Sheet reports (Phase 7 Slice 3)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import PostingLine, post_journal_entry, void_journal_entry
from app.core.onboarding.posting import post_opening_balances
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.cash.models import CashMovementDirection
from app.core.cash.posting import post_cash_movement
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.delivery.schema import DeliveryReportCreate, DeliveryReportPostRequest
from app.features.delivery import service as delivery_service
from app.features.expenses.models import ExpenseItem
from app.features.expenses import service as expense_service
from app.features.expenses.schema import ExpenseCreate
from app.features.onboarding.opening_balances import OpeningBalanceLineInput
from app.features.reports import financial_statements
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate
from tests.delivery_helpers import ACTOR_ID, calendar_month_period, delivery_setup as build_delivery_setup

RENT_EXPENSE_CODE = "5000"
ACCOUNTS_PAYABLE_CODE = "2000"
GO_LIVE = date(2026, 1, 1)
PERIOD_START = date(2026, 1, 1)
PERIOD_END = date(2026, 1, 31)


@pytest.fixture
def fs_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        bank_gl_id = db_session.get(Account, bank.gl_account_id).id
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "drawer": drawer,
        "accounts": accounts,
        "bank_gl_id": bank_gl_id,
    }


@pytest.fixture
def delivery_fs_setup(db_session, restaurant_a):
    setup = build_delivery_setup(db_session, restaurant_a.id, platform_names=("Getir",))
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        setup["accounts"] = {a.code: a.id for a in db_session.scalars(select(Account))}
    setup["getir"] = setup["platforms"]["Getir"]
    setup["drawer"] = drawer
    return setup


def _pl_row_amount(rows, code: str) -> int:
    for row in rows:
        if row.code == code:
            return row.amount_kurus
    raise AssertionError(f"P&L row {code} not found")


def _bs_row_balance(rows, code: str) -> int:
    for row in rows:
        if row.code == code:
            return row.balance_kurus
    raise AssertionError(f"Balance sheet row {code} not found")


def _post_period_sales(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    revenue_id = setup["accounts"][SALES_REVENUE_CODE]

    post_cash_movement(
        db_session,
        entity_id,
        money_account_id=setup["drawer"].id,
        movement_date=date(2026, 1, 10),
        direction=CashMovementDirection.IN,
        amount_kurus=100_000,
        offset_account_id=revenue_id,
        description="Cash sales",
        actor_id=ACTOR_ID,
    )
    pos_posting.post_card_sales_batch(
        db_session,
        entity_id,
        sales_date=date(2026, 1, 12),
        gross_amount_kurus=200_000,
        description="Card sales",
        actor_id=ACTOR_ID,
    )


def _post_delivery_sale(db_session, setup, gross_kurus: int = 300_000) -> None:
    period_start, period_end = calendar_month_period(2026, 1)
    created = delivery_service.create_delivery_report(
        db_session,
        setup["entity_id"],
        DeliveryReportCreate(
            delivery_platform_id=setup["getir"].id,
            period_start=period_start,
            period_end=period_end,
            gross_kurus=gross_kurus,
            description="Delivery platform sales",
            actor_id=ACTOR_ID,
        ),
    )
    delivery_service.post_delivery_report_intake(
        db_session,
        setup["entity_id"],
        created.id,
        DeliveryReportPostRequest(actor_id=ACTOR_ID),
    )


def _post_rent_expense(
    db_session,
    setup,
    *,
    amount_kurus: int,
    expense_date: date,
) -> None:
    entity_id = setup["entity_id"]
    rent_id = setup["accounts"][RENT_EXPENSE_CODE]
    with entity_context(db_session, entity_id):
        item = ExpenseItem(canonical_name="kira", canonical_name_normalized="kira")
        db_session.add(item)
        db_session.commit()
        db_session.refresh(item)
        item_id = item.id

    expense_service.create_expense(
        db_session,
        entity_id,
        ExpenseCreate(
            expense_date=expense_date,
            amount_kurus=amount_kurus,
            expense_account_id=rent_id,
            money_account_id=setup["drawer"].id,
            written_item_description="kira",
            confirm_expense_item_id=item_id,
            has_source_document=False,
            description="Rent",
            actor_id=ACTOR_ID,
        ),
    )


def test_profit_and_loss_revenue_expense_and_net(
    db_session, delivery_fs_setup
) -> None:
    setup = delivery_fs_setup
    _post_period_sales(db_session, setup)
    _post_delivery_sale(db_session, setup, gross_kurus=300_000)
    _post_rent_expense(
        db_session, setup, amount_kurus=80_000, expense_date=date(2026, 1, 20)
    )

    pl = financial_statements.get_profit_and_loss(
        db_session, setup["entity_id"], PERIOD_START, PERIOD_END
    )

    assert _pl_row_amount(pl.accounts, SALES_REVENUE_CODE) == 600_000
    assert _pl_row_amount(pl.accounts, RENT_EXPENSE_CODE) == 80_000
    assert pl.total_revenue_kurus == 600_000
    assert pl.total_expenses_kurus == 80_000
    assert pl.net_income_kurus == 520_000


def test_profit_and_loss_excludes_entry_outside_range(db_session, fs_setup) -> None:
    setup = fs_setup
    _post_period_sales(db_session, setup)
    _post_rent_expense(
        db_session, setup, amount_kurus=50_000, expense_date=date(2026, 2, 5)
    )

    pl = financial_statements.get_profit_and_loss(
        db_session, setup["entity_id"], PERIOD_START, PERIOD_END
    )

    assert pl.total_revenue_kurus == 300_000
    assert pl.total_expenses_kurus == 0
    assert pl.net_income_kurus == 300_000


def test_profit_and_loss_excludes_voided_entry(db_session, fs_setup) -> None:
    setup = fs_setup
    entity_id = setup["entity_id"]
    revenue_id = setup["accounts"][SALES_REVENUE_CODE]
    bank_gl_id = setup["bank_gl_id"]

    entry = post_journal_entry(
        db_session,
        entity_id,
        entry_date=date(2026, 1, 18),
        description="Manual revenue",
        lines=[
            PostingLine(account_id=bank_gl_id, amount_kurus=75_000, side=AccountNormalBalance.DEBIT),
            PostingLine(
                account_id=revenue_id,
                amount_kurus=75_000,
                side=AccountNormalBalance.CREDIT,
            ),
        ],
        actor_id=ACTOR_ID,
        source=JournalEntrySource.MANUAL,
    )
    void_journal_entry(
        db_session,
        entity_id,
        entry.id,
        actor_id=ACTOR_ID,
        reason="Test void",
        void_date=date(2026, 1, 19),
    )

    pl = financial_statements.get_profit_and_loss(
        db_session, entity_id, PERIOD_START, PERIOD_END
    )

    assert _pl_row_amount(pl.accounts, SALES_REVENUE_CODE) == 0
    assert pl.total_revenue_kurus == 0


def test_balance_sheet_opening_balances(db_session, fs_setup) -> None:
    setup = fs_setup
    entity_id = setup["entity_id"]
    supplier = supplier_service.create_supplier(
        db_session,
        entity_id,
        SupplierCreate(name="Metro", vkn="1234567890"),
    )
    post_opening_balances(
        db_session,
        entity_id,
        go_live_date=GO_LIVE,
        lines=[
            OpeningBalanceLineInput(money_account_id=setup["bank"].id, amount_kurus=500_000),
            OpeningBalanceLineInput(supplier_id=supplier.id, amount_kurus=200_000),
        ],
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        bank_gl = db_session.get(Account, setup["bank"].gl_account_id)
        assert bank_gl is not None
        bank_code = bank_gl.code

    bs = financial_statements.get_balance_sheet(
        db_session, entity_id, date(2026, 1, 1)
    )

    assert _bs_row_balance(bs.assets.accounts, bank_code) == 500_000
    assert _bs_row_balance(bs.liabilities.accounts, ACCOUNTS_PAYABLE_CODE) == 200_000
    assert bs.total_assets_kurus == 500_000
    assert bs.total_liabilities_kurus == 200_000
    assert bs.equity.unclosed_net_income_kurus == 0
    assert bs.accounting_equation_balanced is True


def test_balance_sheet_unclosed_net_income_balances_equation(
    db_session, fs_setup
) -> None:
    setup = fs_setup
    _post_period_sales(db_session, setup)
    _post_rent_expense(
        db_session, setup, amount_kurus=30_000, expense_date=date(2026, 1, 20)
    )

    bs = financial_statements.get_balance_sheet(
        db_session, setup["entity_id"], date(2026, 1, 31)
    )

    assert bs.equity.unclosed_net_income_kurus == 270_000
    assert bs.total_liabilities_and_equity_kurus == bs.total_assets_kurus
    assert bs.accounting_equation_balanced is True


def test_profit_and_loss_invalid_date_range_returns_422(
    client: TestClient, restaurant_a
) -> None:
    response = client.get(
        f"/entities/{restaurant_a.id}/reports/profit-and-loss",
        params={"from": "2026-02-01", "to": "2026-01-01"},
    )
    assert response.status_code == 422


def test_financial_statements_api_e2e(
    db_session, client: TestClient, delivery_fs_setup
) -> None:
    setup = delivery_fs_setup
    entity_id = setup["entity_id"]
    _post_period_sales(db_session, setup)
    _post_delivery_sale(db_session, setup, gross_kurus=150_000)
    _post_rent_expense(
        db_session, setup, amount_kurus=20_000, expense_date=date(2026, 1, 16)
    )

    pl_response = client.get(
        f"/entities/{entity_id}/reports/profit-and-loss",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert pl_response.status_code == 200
    pl_body = pl_response.json()
    assert pl_body["total_revenue_kurus"] == 450_000
    assert pl_body["total_expenses_kurus"] == 20_000
    assert pl_body["net_income_kurus"] == 430_000

    bs_response = client.get(
        f"/entities/{entity_id}/reports/balance-sheet",
        params={"as_of": "2026-01-31"},
    )
    assert bs_response.status_code == 200
    bs_body = bs_response.json()
    assert bs_body["equity"]["unclosed_net_income_kurus"] == 430_000
    assert bs_body["accounting_equation_balanced"] is True


def test_cross_entity_isolation(
    db_session, client: TestClient, delivery_fs_setup, restaurant_b
) -> None:
    setup = delivery_fs_setup
    _post_period_sales(db_session, setup)
    seed_default_chart(db_session, restaurant_b.id)

    pl_other = client.get(
        f"/entities/{restaurant_b.id}/reports/profit-and-loss",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert pl_other.status_code == 200
    assert pl_other.json()["total_revenue_kurus"] == 0

    bs_other = client.get(
        f"/entities/{restaurant_b.id}/reports/balance-sheet",
        params={"as_of": "2026-01-31"},
    )
    assert bs_other.status_code == 200
    assert bs_other.json()["total_assets_kurus"] == 0

    missing = client.get(
        f"/entities/{uuid.uuid4()}/reports/profit-and-loss",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert missing.status_code == 404
