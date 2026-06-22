"""Entity dashboard summary API (Phase 7 Slice 2)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.features.cash.models import CashMovementDirection
from app.core.cash.posting import post_cash_movement
from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.fx import posting as fx_posting
from app.core.payables.ledger import record_supplier_movement
from app.core.payables.types import SupplierMovementType
from app.core.pos import posting as pos_posting
from app.core.receivables import posting as receivables_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.customers.models import Customer
from app.features.dashboard import service as dashboard_service
from app.features.delivery.schema import DeliveryReportCreate, DeliveryReportPostRequest
from app.features.delivery import service as delivery_service
from app.features.expenses.models import ExpenseItem
from app.features.expenses import service as expense_service
from app.features.expenses.schema import ExpenseCreate
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup

RENT_EXPENSE_CODE = "5000"
EFATURA_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "efatura" / "sample.xml"


@pytest.fixture
def dashboard_setup(db_session, restaurant_a):
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
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "drawer": drawer,
        "accounts": accounts,
    }


@pytest.fixture
def delivery_dashboard_setup(db_session, restaurant_a):
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
    created = delivery_service.create_delivery_report(
        db_session,
        setup["entity_id"],
        DeliveryReportCreate(
            delivery_platform_id=setup["getir"].id,
            report_date=date(2026, 1, 15),
            gross_kurus=gross_kurus,
            commission_kurus=gross_kurus // 10,
            net_kurus=gross_kurus - gross_kurus // 10,
            description="Delivery report",
            actor_id=ACTOR_ID,
        ),
    )
    delivery_service.post_delivery_report_intake(
        db_session,
        setup["entity_id"],
        created.id,
        DeliveryReportPostRequest(actor_id=ACTOR_ID),
    )


def _post_credit_sale(db_session, setup, customer_id: uuid.UUID, amount: int) -> None:
    receivables_posting.post_credit_sale(
        db_session,
        setup["entity_id"],
        customer_id,
        sale_date=date(2026, 1, 18),
        amount_kurus=amount,
        description="On-account sale",
        actor_id=ACTOR_ID,
    )


def _post_rent_expense(
    db_session,
    setup,
    *,
    amount_kurus: int,
    expense_date: date,
    expense_account_id: uuid.UUID | None = None,
    item_id: uuid.UUID | None = None,
) -> None:
    entity_id = setup["entity_id"]
    rent_id = expense_account_id or setup["accounts"][RENT_EXPENSE_CODE]
    if item_id is None:
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


def test_period_sales_breakdown(db_session, delivery_dashboard_setup) -> None:
    setup = delivery_dashboard_setup
    _post_period_sales(db_session, setup)
    _post_delivery_sale(db_session, setup, gross_kurus=300_000)

    with entity_context(db_session, setup["entity_id"]):
        customer = Customer(name="Catering Co")
        db_session.add(customer)
        db_session.commit()
        db_session.refresh(customer)
    _post_credit_sale(db_session, setup, customer.id, 50_000)

    dash = dashboard_service.get_dashboard(
        db_session, setup["entity_id"], date(2026, 1, 1), date(2026, 1, 31)
    )

    assert dash.sales.cash_sales_kurus == 100_000
    assert dash.sales.pos_card_sales_kurus == 200_000
    assert dash.sales.delivery_sales_kurus == 300_000
    assert dash.sales.other_sales_kurus == 50_000
    assert dash.sales.total_sales_kurus == 650_000


def test_period_expenses_and_net_result(db_session, dashboard_setup) -> None:
    setup = dashboard_setup
    _post_period_sales(db_session, setup)
    _post_rent_expense(
        db_session, setup, amount_kurus=80_000, expense_date=date(2026, 1, 20)
    )

    dash = dashboard_service.get_dashboard(
        db_session, setup["entity_id"], date(2026, 1, 1), date(2026, 1, 31)
    )

    assert dash.total_expenses_kurus == 80_000
    assert dash.net_result_kurus == dash.sales.total_sales_kurus - 80_000


def test_payables_total_and_preview_ordering(db_session, dashboard_setup) -> None:
    setup = dashboard_setup
    entity_id = setup["entity_id"]

    high = supplier_service.create_supplier(
        db_session, entity_id, SupplierCreate(name="High Balance", vkn="1111111111")
    )
    high_id = high.id
    mid = supplier_service.create_supplier(
        db_session, entity_id, SupplierCreate(name="Mid Balance", vkn="2222222222")
    )
    mid_id = mid.id
    low = supplier_service.create_supplier(
        db_session, entity_id, SupplierCreate(name="Low Balance", vkn="3333333333")
    )
    low_id = low.id
    supplier_amounts = [
        (high_id, 500_000),
        (mid_id, 200_000),
        (low_id, 50_000),
    ]

    for supplier_id, amount in supplier_amounts:
        record_supplier_movement(
            db_session,
            entity_id,
            supplier_id,
            movement_date=date(2026, 1, 5),
            movement_type=SupplierMovementType.ADJUSTMENT,
            amount_kurus=amount,
            description="Balance",
            actor_id=ACTOR_ID,
        )

    dash = dashboard_service.get_dashboard(
        db_session, entity_id, date(2026, 1, 1), date(2026, 1, 31)
    )

    assert dash.total_payables_kurus == 750_000
    assert len(dash.payables_preview) == 3
    assert dash.payables_preview[0].supplier_name == "High Balance"
    assert dash.payables_preview[0].balance_kurus == 500_000
    assert dash.payables_preview[1].supplier_name == "Mid Balance"
    assert dash.payables_preview[2].supplier_name == "Low Balance"


def test_payables_preview_supplier_filter(db_session, dashboard_setup) -> None:
    setup = dashboard_setup
    entity_id = setup["entity_id"]
    supplier = supplier_service.create_supplier(
        db_session, entity_id, SupplierCreate(name="Filtered", vkn="4444444444")
    )
    supplier_id = supplier.id
    record_supplier_movement(
        db_session,
        entity_id,
        supplier_id,
        movement_date=date(2026, 1, 5),
        movement_type=SupplierMovementType.ADJUSTMENT,
        amount_kurus=99_000,
        description="Only one",
        actor_id=ACTOR_ID,
    )

    dash = dashboard_service.get_dashboard(
        db_session,
        entity_id,
        date(2026, 1, 1),
        date(2026, 1, 31),
        supplier_id=supplier_id,
    )

    assert dash.total_payables_kurus == 99_000
    assert len(dash.payables_preview) == 1
    assert dash.payables_preview[0].supplier_id == supplier_id


def test_receivables_total(db_session, dashboard_setup) -> None:
    setup = dashboard_setup

    with entity_context(db_session, setup["entity_id"]):
        customer = Customer(name="Receivable Co")
        db_session.add(customer)
        db_session.commit()
        db_session.refresh(customer)

    _post_credit_sale(db_session, setup, customer.id, 125_000)

    dash = dashboard_service.get_dashboard(
        db_session, setup["entity_id"], date(2026, 1, 1), date(2026, 1, 31)
    )

    assert dash.total_receivables_kurus == 125_000


def test_delivery_in_transit_clearing_balance(db_session, delivery_dashboard_setup) -> None:
    setup = delivery_dashboard_setup
    _post_delivery_sale(db_session, setup, gross_kurus=400_000)

    dash = dashboard_service.get_dashboard(
        db_session, setup["entity_id"], date(2026, 1, 1), date(2026, 1, 31)
    )

    assert len(dash.delivery_in_transit) == 1
    assert dash.delivery_in_transit[0].platform_name == "Getir"
    assert dash.delivery_in_transit[0].clearing_balance_kurus == 400_000
    assert dash.delivery_platforms[0].gross_kurus == 400_000


def test_needs_review_counts(db_session, client: TestClient, dashboard_setup) -> None:
    setup = dashboard_setup
    entity_id = setup["entity_id"]
    rent_id = setup["accounts"][RENT_EXPENSE_CODE]

    with entity_context(db_session, entity_id):
        item = ExpenseItem(canonical_name="peynir", canonical_name_normalized="peynir")
        db_session.add(item)
        db_session.commit()

    expense_resp = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": "2026-06-03",
            "amount_kurus": 5_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(setup["drawer"].id),
            "written_item_description": "peynr",
            "has_source_document": True,
            "description": "Belirsiz",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert expense_resp.status_code == 201
    assert expense_resp.json()["status"] == "needs_review"

    with EFATURA_FIXTURE.open("rb") as handle:
        upload = client.post(
            f"/entities/{entity_id}/invoices/efatura/draft",
            files={"file": ("sample.xml", handle, "application/xml")},
        )
    assert upload.status_code == 201
    reject = client.post(
        f"/entities/{entity_id}/invoices/drafts/{upload.json()['id']}/reject",
        json={"reason": "Check totals"},
    )
    assert reject.status_code == 200
    assert reject.json()["status"] == "needs_review"

    dash = dashboard_service.get_dashboard(
        db_session, entity_id, date(2026, 1, 1), date(2026, 12, 31)
    )

    assert dash.needs_review.expense_entries >= 1
    assert dash.needs_review.invoice_drafts >= 1
    assert dash.needs_review.total >= 2


def test_try_money_position_and_fx_separate(db_session, dashboard_setup) -> None:
    setup = dashboard_setup
    entity_id = setup["entity_id"]

    fx_wallet = banking_service.create_money_account(
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
        fx_money_account_id=fx_wallet.id,
        try_cash_money_account_id=setup["drawer"].id,
        purchase_date=date(2026, 1, 5),
        native_quantity=10_000,
        try_cost_kurus=350_000,
        description="USD buy",
        actor_id=ACTOR_ID,
    )

    post_cash_movement(
        db_session,
        entity_id,
        money_account_id=setup["drawer"].id,
        movement_date=date(2026, 1, 6),
        direction=CashMovementDirection.IN,
        amount_kurus=50_000,
        offset_account_id=setup["accounts"][SALES_REVENUE_CODE],
        description="Float",
        actor_id=ACTOR_ID,
    )

    dash = dashboard_service.get_dashboard(
        db_session, entity_id, date(2026, 1, 1), date(2026, 1, 31)
    )

    assert dash.total_try_position_kurus == -300_000
    assert len(dash.fx_balances) == 1
    assert dash.fx_balances[0].money_account_id == fx_wallet.id
    assert dash.fx_balances[0].native_quantity == 10_000
    assert dash.fx_balances[0].try_cost_kurus == 350_000


def test_money_account_filter(db_session, dashboard_setup) -> None:
    setup = dashboard_setup

    dash = dashboard_service.get_dashboard(
        db_session,
        setup["entity_id"],
        date(2026, 1, 1),
        date(2026, 1, 31),
        money_account_id=setup["bank"].id,
    )

    assert dash.total_try_position_kurus == 0


def test_expense_account_filter(db_session, dashboard_setup) -> None:
    setup = dashboard_setup
    rent_id = setup["accounts"][RENT_EXPENSE_CODE]
    salaries_id = setup["accounts"]["5100"]

    _post_rent_expense(
        db_session, setup, amount_kurus=40_000, expense_date=date(2026, 1, 10)
    )
    item_id = None
    with entity_context(db_session, setup["entity_id"]):
        existing = db_session.scalar(
            select(ExpenseItem).where(ExpenseItem.canonical_name_normalized == "kira")
        )
        if existing is not None:
            item_id = existing.id
    _post_rent_expense(
        db_session,
        setup,
        amount_kurus=60_000,
        expense_date=date(2026, 1, 11),
        expense_account_id=salaries_id,
        item_id=item_id,
    )

    dash_all = dashboard_service.get_dashboard(
        db_session, setup["entity_id"], date(2026, 1, 1), date(2026, 1, 31)
    )
    dash_rent = dashboard_service.get_dashboard(
        db_session,
        setup["entity_id"],
        date(2026, 1, 1),
        date(2026, 1, 31),
        expense_account_id=rent_id,
    )

    assert dash_all.total_expenses_kurus == 100_000
    assert dash_rent.total_expenses_kurus == 40_000


def test_invalid_date_range_returns_422(client: TestClient, restaurant_a) -> None:
    response = client.get(
        f"/entities/{restaurant_a.id}/dashboard",
        params={"from": "2026-02-01", "to": "2026-01-01"},
    )
    assert response.status_code == 422


def test_dashboard_api_e2e(db_session, client: TestClient, dashboard_setup) -> None:
    setup = dashboard_setup
    entity_id = setup["entity_id"]
    _post_period_sales(db_session, setup)
    _post_rent_expense(
        db_session, setup, amount_kurus=25_000, expense_date=date(2026, 1, 14)
    )

    response = client.get(
        f"/entities/{entity_id}/dashboard",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert response.status_code == 200
    body = response.json()

    assert body["sales"]["total_sales_kurus"] == 300_000
    assert body["total_expenses_kurus"] == 25_000
    assert body["net_result_kurus"] == 275_000
    assert body["tax_department_payments_kurus"] is None
    assert "needs_review" in body


def test_cross_entity_isolation(
    db_session, client: TestClient, dashboard_setup, restaurant_b
) -> None:
    setup = dashboard_setup
    _post_period_sales(db_session, setup)
    seed_default_chart(db_session, restaurant_b.id)

    other = client.get(
        f"/entities/{restaurant_b.id}/dashboard",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert other.status_code == 200
    assert other.json()["sales"]["total_sales_kurus"] == 0

    missing = client.get(
        f"/entities/{uuid.uuid4()}/dashboard",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert missing.status_code == 404
