"""Excel export for Phase 7 reports (Phase 7 Slice 7)."""

from __future__ import annotations

from datetime import date
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.cash.posting import post_cash_movement
from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.cash.models import CashMovementDirection
from app.features.reports import excel_export
from app.features.reports import financial_statements
from tests.delivery_helpers import ACTOR_ID
from tests.test_financial_statements import (
    PERIOD_END,
    PERIOD_START,
    _post_period_sales,
    _post_rent_expense,
)
from tests.test_kdv_input_report import (
    _post_supplier_draft,
    _supplier,
    _supplier_draft,
)

XLSX_CONTENT_TYPE = excel_export.XLSX_CONTENT_TYPE


@pytest.fixture
def export_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "accounts": accounts,
    }


@pytest.fixture
def kdv_export_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {"entity_id": restaurant_a.id, "accounts": accounts}


def _load_sheet(data: bytes):
    wb = load_workbook(BytesIO(data))
    return wb.active


def _cell_values(ws, row: int) -> list:
    return [ws.cell(row=row, column=col).value for col in range(1, ws.max_column + 1)]


def _assert_xlsx_export(response, *, header_text: str) -> None:
    assert response.status_code == 200
    assert response.headers["content-type"] == XLSX_CONTENT_TYPE
    ws = _load_sheet(response.content)
    found_header = False
    for row in range(1, ws.max_row + 1):
        if header_text in _cell_values(ws, row):
            found_header = True
            break
    assert found_header, f"Expected header {header_text!r} in worksheet"


def test_profit_and_loss_export(
    db_session, client: TestClient, export_setup
) -> None:
    setup = export_setup
    _post_period_sales(db_session, setup)
    _post_rent_expense(
        db_session, setup, amount_kurus=20_000, expense_date=date(2026, 1, 16)
    )

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss/export",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    _assert_xlsx_export(response, header_text="Code")

    pl_json = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    ).json()
    pl_report = financial_statements.get_profit_and_loss(
        db_session, setup["entity_id"], PERIOD_START, PERIOD_END
    )
    ws = _load_sheet(response.content)
    data_rows = 0
    for row in range(1, ws.max_row + 1):
        if ws.cell(row=row, column=1).value in {
            acc.code for acc in pl_report.accounts
        }:
            data_rows += 1
    assert data_rows == len(pl_json["accounts"])


def test_profit_and_loss_export_invalid_date_range(
    client: TestClient, export_setup
) -> None:
    response = client.get(
        f"/entities/{export_setup['entity_id']}/reports/profit-and-loss/export",
        params={"from": "2026-02-01", "to": "2026-01-01"},
    )
    assert response.status_code == 422


def test_balance_sheet_export(
    db_session, client: TestClient, export_setup
) -> None:
    setup = export_setup
    _post_period_sales(db_session, setup)

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/balance-sheet/export",
        params={"as_of": "2026-01-31"},
    )
    _assert_xlsx_export(response, header_text="Assets")

    disposition = response.headers.get("content-disposition", "")
    assert 'filename="mizan-balance-sheet-2026-01-31.xlsx"' in disposition


def test_kdv_input_export(
    client: TestClient, db_session, restaurant_a, kdv_export_setup
) -> None:
    setup = kdv_export_setup
    supplier_id = _supplier(db_session, restaurant_a)
    expense_id = setup["accounts"]["5200"]
    draft = _supplier_draft(
        db_session,
        setup["entity_id"],
        supplier_id,
        invoice_date=date(2026, 5, 1),
        invoice_number="XLSX-INV",
        net_kurus=200_000,
        gross_kurus=240_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 200_000, "vat_kurus": 40_000},
        ],
        file_fingerprint="kdv-xlsx-fp",
    )
    _post_supplier_draft(db_session, setup["entity_id"], draft.id, expense_id)

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/kdv-input/export",
        params={"from": "2026-05-01", "to": "2026-05-31"},
    )
    _assert_xlsx_export(response, header_text="Rate (%)")


def test_kdv_input_export_invalid_date_range(
    client: TestClient, kdv_export_setup
) -> None:
    response = client.get(
        f"/entities/{kdv_export_setup['entity_id']}/reports/kdv-input/export",
        params={"from": "2026-05-31", "to": "2026-05-01"},
    )
    assert response.status_code == 422


def test_period_comparison_export(
    db_session, client: TestClient, export_setup
) -> None:
    setup = export_setup
    post_cash_movement(
        db_session,
        setup["entity_id"],
        money_account_id=setup["drawer"].id,
        movement_date=date(2026, 1, 10),
        direction=CashMovementDirection.IN,
        amount_kurus=100_000,
        offset_account_id=setup["accounts"][SALES_REVENUE_CODE],
        description="Cash sales",
        actor_id=ACTOR_ID,
    )
    pos_posting.post_card_sales_batch(
        db_session,
        setup["entity_id"],
        sales_date=date(2026, 1, 12),
        gross_amount_kurus=50_000,
        description="Card sales",
        actor_id=ACTOR_ID,
    )

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/period-comparison/export",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    _assert_xlsx_export(response, header_text="Metric")


def test_period_comparison_export_invalid_date_range(
    client: TestClient, export_setup
) -> None:
    response = client.get(
        f"/entities/{export_setup['entity_id']}/reports/period-comparison/export",
        params={"from": "2026-02-01", "to": "2026-01-01"},
    )
    assert response.status_code == 422
