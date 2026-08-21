"""S14 — salaries/FX quantity headers + statement PDF Amount (₺) / sealed banner.

Assert by loading workbooks and rendering PDFs — never by grepping builders.
"""

from __future__ import annotations

from datetime import date

import fitz
import pytest
from sqlalchemy import select

from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.excel.workbook import money_header, quantity_header
from app.core.period_locks.models import PeriodLockKind
from app.core.period_locks.service import close_period
from app.core.staff import posting as staff_posting
from app.core.staff.types import PayCurrency
from app.db.session import entity_context
from app.features.auth import service as auth_service
from app.features.auth.schema import MembershipCreate, UserCreate
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.reports import financial_statements, statement_exports
from app.features.staff.models import Employee
from tests.test_month_pack import JUNE_END, JUNE_START, _buy_usd, _pack
from tests.test_statement_export_view import _sale as _s6_sale


@pytest.fixture
def books(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    owner = auth_service.create_user(
        db_session,
        UserCreate(email="s14-pack-owner@example.com", display_name="Owner"),
    )
    auth_service.add_entity_member(
        db_session,
        restaurant_a.id,
        MembershipCreate(user_id=owner.id, role=EntityRole.OWNER),
    )
    banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK, name="Garanti", bank_name="Garanti"
        ),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {"entity_id": restaurant_a.id, "owner_id": owner.id, "accounts": accounts}


@pytest.fixture
def s6_books(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    owner = auth_service.create_user(
        db_session,
        UserCreate(email="s14-s6-owner@example.com", display_name="Owner"),
    )
    auth_service.add_entity_member(
        db_session,
        restaurant_a.id,
        MembershipCreate(user_id=owner.id, role=EntityRole.OWNER),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {"entity_id": restaurant_a.id, "owner_id": owner.id, "accounts": accounts}


def _pdf_text(data: bytes) -> str:
    with fitz.open(stream=data, filetype="pdf") as doc:
        return "\n".join(page.get_text() for page in doc)


def test_month_pack_salaries_try_amount_header_carries_lira(db_session, books) -> None:
    with entity_context(db_session, books["entity_id"]):
        employee = Employee(name="TRY Cook", pay_currency=PayCurrency.TRY)
        db_session.add(employee)
        db_session.commit()
        db_session.refresh(employee)
        employee_id = employee.id
    staff_posting.post_salary_accrual(
        db_session,
        books["entity_id"],
        employee_id,
        accrual_date=date(2026, 6, 10),
        amount_minor=100_000,
        description="TRY salary",
        actor_id=books["owner_id"],
        period_year=2026,
        period_month=6,
    )
    wb, _ = _pack(db_session, books)
    salaries = wb["Salaries"]
    headers = [salaries.cell(row=5, column=c).value for c in range(1, 8)]
    assert headers[5] == money_header()
    assert headers[6] == money_header("TRY cost")
    amount = salaries.cell(row=6, column=6).value
    assert isinstance(amount, (int, float))
    assert amount == 1000.0


def test_month_pack_fx_holdings_quantity_and_try_headers(db_session, books) -> None:
    _buy_usd(db_session, books, native=10_000, try_cost=350_000, on=date(2026, 6, 5))
    wb, _ = _pack(db_session, books)
    fx = wb["Foreign currency"]
    headers = [fx.cell(row=4, column=c).value for c in range(1, 5)]
    assert headers[2] == quantity_header("USD")
    assert headers[3] == money_header("TRY cost")
    assert isinstance(fx.cell(row=5, column=3).value, (int, float))
    assert isinstance(fx.cell(row=5, column=4).value, (int, float))


def test_pnl_pdf_amount_header_and_sealed_banner(db_session, s6_books) -> None:
    _s6_sale(db_session, s6_books)
    close_period(
        db_session,
        s6_books["entity_id"],
        lock_kind=PeriodLockKind.MONTH,
        anchor_date=JUNE_END,
        actor_id=s6_books["owner_id"],
    )

    sealed_data, sealed_name = statement_exports.profit_and_loss_pdf(
        db_session,
        s6_books["entity_id"],
        JUNE_START,
        JUNE_END,
        view=financial_statements.VIEW_AS_CLOSED,
    )
    assert sealed_name.endswith("-as-closed.pdf")
    sealed_text = _pdf_text(sealed_data)
    assert money_header() in sealed_text
    assert "As closed" in sealed_text

    live_data, live_name = statement_exports.profit_and_loss_pdf(
        db_session,
        s6_books["entity_id"],
        JUNE_START,
        JUNE_END,
        view=financial_statements.VIEW_LIVE,
    )
    assert live_name.endswith("-live.pdf")
    live_text = _pdf_text(live_data)
    assert money_header() in live_text
    assert "Live" in live_text


def test_balance_sheet_pdf_balance_header_and_sealed_banner(db_session, s6_books) -> None:
    _s6_sale(db_session, s6_books)
    close_period(
        db_session,
        s6_books["entity_id"],
        lock_kind=PeriodLockKind.MONTH,
        anchor_date=JUNE_END,
        actor_id=s6_books["owner_id"],
    )
    data, filename = statement_exports.balance_sheet_pdf(
        db_session,
        s6_books["entity_id"],
        JUNE_END,
        view=financial_statements.VIEW_AS_CLOSED,
    )
    assert filename.endswith("-as-closed.pdf")
    text = _pdf_text(data)
    assert money_header("Balance") in text
    assert "As closed" in text
