"""PDF export for financial statements (Phase 8.5 Slice 5)."""

from __future__ import annotations

from datetime import date
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import select

from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.models import Account
from app.core.money import format_try
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.entities.models import Entity
from app.features.reports import financial_statements
from app.features.reports import pdf_export
from tests.auth_helpers import auth_headers
from tests.test_financial_statements import (
    PERIOD_END,
    PERIOD_START,
    _post_period_sales,
    _post_rent_expense,
)
from tests.test_roles_permissions import _add_member, _create_user, auth_enforced

PDF_CONTENT_TYPE = pdf_export.PDF_CONTENT_TYPE
TURKISH_ENTITY_NAME = "İstanbul Şişli Çağdaş Balık Restoranı"


@pytest.fixture
def pdf_export_setup(db_session, restaurant_a):
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
        "entity_name": restaurant_a.name,
        "drawer": drawer,
        "accounts": accounts,
    }


@pytest.fixture
def turkish_pdf_export_setup(db_session):
    entity = Entity(name=TURKISH_ENTITY_NAME)
    db_session.add(entity)
    db_session.commit()
    db_session.refresh(entity)
    seed_default_chart(db_session, entity.id)
    drawer = banking_service.create_money_account(
        db_session,
        entity.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Ana Kasa"),
    )
    with entity_context(db_session, entity.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": entity.id,
        "entity_name": entity.name,
        "drawer": drawer,
        "accounts": accounts,
    }


def _pdf_text(data: bytes) -> str:
    reader = PdfReader(BytesIO(data))
    return "".join(page.extract_text() or "" for page in reader.pages)


def _assert_amount_with_try_symbol(amount_kurus: int, text: str) -> None:
    formatted = format_try(amount_kurus)
    assert "₺" in text, "PDF must render the Turkish lira symbol (₺)"
    assert formatted in text, f"expected formatted amount {formatted!r} in PDF text"


def _assert_pdf_export(response, *, filename_fragment: str) -> bytes:
    assert response.status_code == 200
    assert response.headers["content-type"] == PDF_CONTENT_TYPE
    disposition = response.headers.get("content-disposition", "")
    assert filename_fragment in disposition
    assert response.content[:4] == b"%PDF"
    return response.content


def test_profit_and_loss_pdf_export(
    db_session, client: TestClient, pdf_export_setup
) -> None:
    setup = pdf_export_setup
    _post_period_sales(db_session, setup)
    _post_rent_expense(
        db_session, setup, amount_kurus=20_000, expense_date=date(2026, 1, 16)
    )

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss/export/pdf",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    data = _assert_pdf_export(
        response, filename_fragment='filename="mizan-profit-and-loss-2026-01-01-2026-01-31.pdf"'
    )

    pl_report = financial_statements.get_profit_and_loss(
        db_session, setup["entity_id"], PERIOD_START, PERIOD_END
    )
    text = _pdf_text(data)
    assert setup["entity_name"] in text
    _assert_amount_with_try_symbol(pl_report.net_income_kurus, text)
    _assert_amount_with_try_symbol(pl_report.total_revenue_kurus, text)


def test_balance_sheet_pdf_export(
    db_session, client: TestClient, pdf_export_setup
) -> None:
    setup = pdf_export_setup
    _post_period_sales(db_session, setup)

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/balance-sheet/export/pdf",
        params={"as_of": "2026-01-31"},
    )
    data = _assert_pdf_export(
        response, filename_fragment='filename="mizan-balance-sheet-2026-01-31.pdf"'
    )

    bs_report = financial_statements.get_balance_sheet(
        db_session, setup["entity_id"], date(2026, 1, 31)
    )
    text = _pdf_text(data)
    assert setup["entity_name"] in text
    assert "Assets" in text
    _assert_amount_with_try_symbol(bs_report.total_assets_kurus, text)


def test_cash_flow_pdf_export(
    db_session, client: TestClient, pdf_export_setup
) -> None:
    setup = pdf_export_setup
    _post_period_sales(db_session, setup)

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/cash-flow/export/pdf",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    data = _assert_pdf_export(
        response, filename_fragment='filename="mizan-cash-flow-2026-01-01-2026-01-31.pdf"'
    )

    text = _pdf_text(data)
    assert setup["entity_name"] in text
    assert "Opening cash" in text
    _assert_amount_with_try_symbol(100_000, text)


def test_pdf_renders_turkish_entity_name_and_glyphs(
    db_session, client: TestClient, turkish_pdf_export_setup
) -> None:
    setup = turkish_pdf_export_setup
    _post_period_sales(db_session, setup)

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss/export/pdf",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    data = _assert_pdf_export(
        response, filename_fragment='filename="mizan-profit-and-loss-2026-01-01-2026-01-31.pdf"'
    )

    text = _pdf_text(data)
    for glyph in ("ğ", "ı", "İ", "ş", "₺"):
        assert glyph in text, f"PDF must render Turkish glyph {glyph!r}"
    assert "Çağdaş" in text


def test_profit_and_loss_pdf_invalid_date_range(
    client: TestClient, pdf_export_setup
) -> None:
    response = client.get(
        f"/entities/{pdf_export_setup['entity_id']}/reports/profit-and-loss/export/pdf",
        params={"from": "2026-02-01", "to": "2026-01-01"},
    )
    assert response.status_code == 422


def test_cashier_blocked_from_profit_and_loss_pdf(
    auth_enforced,
    client: TestClient,
    db_session,
    pdf_export_setup,
) -> None:
    setup = pdf_export_setup
    cashier = _create_user(db_session, "pdf-cashier@example.com")
    _add_member(db_session, setup["entity_id"], cashier.id, EntityRole.CASHIER)

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/profit-and-loss/export/pdf",
        params={"from": "2026-01-01", "to": "2026-01-31"},
        headers=auth_headers(cashier),
    )
    assert response.status_code == 403
