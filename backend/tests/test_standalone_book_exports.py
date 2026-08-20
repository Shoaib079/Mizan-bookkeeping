"""Standalone cash-book / hand-recorded expenses / GL Excel downloads (S9)."""

from __future__ import annotations

from datetime import date
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.models import Account
from app.core.excel.workbook import money_header
from app.core.ledger.balances import balance_as_of_kurus
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.expenses import service as expenses_service
from app.features.expenses.schema import ExpenseCreate
from app.features.reports import cash_book as cash_book_report
from app.features.reports import excel_export
from app.features.reports.cash_bank_book_export import cash_bank_book_filename
from tests.delivery_helpers import ACTOR_ID
from tests.test_financial_statements import (
    PERIOD_END,
    PERIOD_START,
    _post_period_sales,
    _post_rent_expense,
)

XLSX = excel_export.XLSX_CONTENT_TYPE


@pytest.fixture
def books_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK, name="Garanti", bank_name="Garanti"
        ),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "bank": bank,
        "accounts": accounts,
    }


def test_cash_bank_book_export_sheets_and_closing(
    db_session, client: TestClient, books_setup
) -> None:
    setup = books_setup
    _post_period_sales(db_session, setup)
    _post_rent_expense(
        db_session, setup, amount_kurus=20_000, expense_date=date(2026, 1, 16)
    )

    response = client.get(
        f"/entities/{setup['entity_id']}/reports/cash-book/export",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == XLSX
    disposition = response.headers.get("content-disposition", "")
    assert "mizan-cash-bank-book-2026-01-" in disposition
    assert disposition.endswith('.xlsx"') or ".xlsx" in disposition

    wb = load_workbook(BytesIO(response.content))
    names = wb.sheetnames
    assert any(n.startswith("Cash — ") for n in names)
    assert any(n.startswith("Bank — ") for n in names)

    # Amounts are lira floats, not raw kuruş.
    cash_ws = next(wb[n] for n in names if n.startswith("Cash — "))
    found_lira = False
    for row in cash_ws.iter_rows(min_row=1, max_row=cash_ws.max_row, max_col=6):
        for cell in row:
            if isinstance(cell.value, (int, float)) and cell.value == 1000.0:
                found_lira = True
            assert cell.value != 100_000
    assert found_lira

    book = cash_book_report.get_cash_book(
        db_session,
        setup["entity_id"],
        setup["drawer"].id,
        PERIOD_START,
        PERIOD_END,
    )
    # Closing cell is row 4 col 2 in the month-pack account-book layout.
    closing_cell = cash_ws.cell(row=4, column=2).value
    assert closing_cell == pytest.approx(book.closing_kurus / 100, abs=0.01)

    with entity_context(db_session, setup["entity_id"]):
        gl = db_session.get(Account, setup["drawer"].gl_account_id)
        gl_closing = balance_as_of_kurus(db_session, gl, PERIOD_END)
    assert book.closing_kurus == gl_closing


def test_cash_bank_book_filename_suffix() -> None:
    assert cash_bank_book_filename(
        date(2026, 1, 1), date(2026, 1, 31), sealed=False
    ).endswith("-live.xlsx")
    assert cash_bank_book_filename(
        date(2026, 1, 1), date(2026, 1, 31), sealed=True
    ).endswith("-as-closed.xlsx")


def test_hand_recorded_expenses_export_total_matches_list(
    db_session, client: TestClient, books_setup
) -> None:
    setup = books_setup
    expenses_service.create_expense(
        db_session,
        setup["entity_id"],
        ExpenseCreate(
            expense_date=date(2026, 1, 10),
            amount_kurus=15_000,
            expense_account_id=setup["accounts"]["5200"],
            money_account_id=setup["drawer"].id,
            written_item_description="Tea towels",
            description="Tea towels",
            notes="kitchen",
            actor_id=ACTOR_ID,
        ),
    )
    expenses_service.create_expense(
        db_session,
        setup["entity_id"],
        ExpenseCreate(
            expense_date=date(2026, 1, 12),
            amount_kurus=25_000,
            expense_account_id=setup["accounts"]["5200"],
            money_account_id=setup["drawer"].id,
            written_item_description="Soap",
            description="Soap",
            actor_id=ACTOR_ID,
        ),
    )

    list_res = client.get(
        f"/entities/{setup['entity_id']}/expenses",
        params={"from": "2026-01-01", "to": "2026-01-31", "limit": 200},
    )
    assert list_res.status_code == 200
    page_total = list_res.json()["total_amount_kurus"]
    assert page_total == 40_000

    response = client.get(
        f"/entities/{setup['entity_id']}/expenses/export",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == XLSX
    wb = load_workbook(BytesIO(response.content))
    ws = wb.active
    assert ws["A1"].value == "Hand-recorded expenses"
    assert money_header("Amount") in [
        ws.cell(row=4, column=c).value for c in range(1, 7)
    ]

    # Footer total (last money cell in column 6).
    total_cell = None
    for r in range(ws.max_row, 0, -1):
        if ws.cell(row=r, column=5).value == "Total":
            total_cell = ws.cell(row=r, column=6).value
            break
    assert total_cell == pytest.approx(page_total / 100, abs=0.01)


def test_general_ledger_export_sheets_and_tie(
    db_session, client: TestClient, books_setup
) -> None:
    setup = books_setup
    _post_period_sales(db_session, setup)
    _post_rent_expense(
        db_session, setup, amount_kurus=20_000, expense_date=date(2026, 1, 16)
    )

    list_res = client.get(
        f"/entities/{setup['entity_id']}/ledger/entries",
        params={
            "from": "2026-01-01",
            "to": "2026-01-31",
            "effective_only": "true",
            "limit": 200,
        },
    )
    assert list_res.status_code == 200
    entries = list_res.json()["items"]
    expected_lines = sum(len(e["lines"]) for e in entries)

    response = client.get(
        f"/entities/{setup['entity_id']}/ledger/entries/export",
        params={
            "from": "2026-01-01",
            "to": "2026-01-31",
            "effective_only": "true",
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == XLSX
    disposition = response.headers.get("content-disposition", "")
    assert "-live.xlsx" in disposition or "-as-closed.xlsx" in disposition

    wb = load_workbook(BytesIO(response.content))
    assert wb.sheetnames == ["By account", "All entries"]

    by_acct = wb["By account"]
    # Data starts at row 5; each row must tie opening + signed period = closing.
    for r in range(5, by_acct.max_row + 1):
        code = by_acct.cell(row=r, column=1).value
        if not code:
            continue
        opening = by_acct.cell(row=r, column=3).value or 0
        debits = by_acct.cell(row=r, column=4).value or 0
        credits = by_acct.cell(row=r, column=5).value or 0
        closing = by_acct.cell(row=r, column=6).value or 0
        # Compare in lira space with debit-normal identity for cash/expense
        # and credit-normal for revenue — recompute via GL for the code.
        with entity_context(db_session, setup["entity_id"]):
            account = db_session.scalar(
                select(Account).where(Account.code == code)
            )
            assert account is not None
            from app.core.chart_of_accounts.types import AccountNormalBalance

            if account.normal_balance == AccountNormalBalance.DEBIT:
                assert closing == pytest.approx(opening + debits - credits, abs=0.01)
            else:
                assert closing == pytest.approx(opening + credits - debits, abs=0.01)

    detail = wb["All entries"]
    data_lines = 0
    for r in range(5, detail.max_row + 1):
        if detail.cell(row=r, column=1).value:
            data_lines += 1
    assert data_lines == expected_lines
