"""One workbook with every book for the period — the file sent to partners.

Checking a month used to mean six separate downloads, and four of the books
(expenses, cash, bank, ledger) had no export at all.
"""

from __future__ import annotations

import uuid
from datetime import date
from io import BytesIO

import pytest
from openpyxl import load_workbook
from sqlalchemy import select

from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.excel.workbook import money_header
from app.core.fx import posting as fx_posting
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import PostingLine, post_journal_entry
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
from app.features.reports import month_pack
from app.features.staff.models import Employee

CASH_CODE = "1000"
JUNE_START = date(2026, 6, 1)
JUNE_END = date(2026, 6, 30)


@pytest.fixture
def books(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    owner = auth_service.create_user(
        db_session,
        UserCreate(email="pack-owner@example.com", display_name="Owner"),
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


def _sale(db_session, books, on: date, amount: int):
    with entity_context(db_session, books["entity_id"]):
        post_journal_entry(
            db_session,
            books["entity_id"],
            on,
            "Cash sale",
            [
                PostingLine(
                    books["accounts"][CASH_CODE], amount, AccountNormalBalance.DEBIT
                ),
                PostingLine(
                    books["accounts"][SALES_REVENUE_CODE],
                    amount,
                    AccountNormalBalance.CREDIT,
                ),
            ],
            actor_id=books["owner_id"],
            source=JournalEntrySource.MANUAL,
        )
        db_session.commit()


def _pack(db_session, books, from_date=JUNE_START, to_date=JUNE_END):
    data, ctx = month_pack.build_month_pack_xlsx(
        db_session, books["entity_id"], from_date, to_date
    )
    return load_workbook(BytesIO(data)), ctx


def test_the_pack_holds_every_book(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    wb, _ = _pack(db_session, books)

    names = wb.sheetnames
    assert "Summary" in names
    assert "Sales" in names
    assert "Expenses" in names
    assert "Salaries" in names
    assert "Card clearing" in names
    assert "Profit and loss" in names
    assert "General ledger" in names
    # One sheet per money account, named so a partner knows which is which.
    assert any(n.startswith("Cash — ") for n in names)
    assert any(n.startswith("Bank — ") for n in names)


def test_the_summary_names_the_period_and_the_business(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    wb, _ = _pack(db_session, books)

    summary = wb["Summary"]
    assert "2026-06-01 to 2026-06-30" in str(summary.cell(row=2, column=2).value)
    assert "books for the period" in str(summary.cell(row=1, column=1).value)


def test_an_open_month_says_it_is_live(db_session, books):
    """A partner must be able to tell a draft from a sealed month."""
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    wb, ctx = _pack(db_session, books)

    assert ctx.sealed is False
    assert "Live" in str(wb["Summary"].cell(row=3, column=2).value)


def test_a_closed_month_exports_its_sealed_figures(db_session, books):
    """Two partners downloading on different days must get the same file."""
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    close_period(
        db_session,
        books["entity_id"],
        lock_kind=PeriodLockKind.MONTH,
        anchor_date=JUNE_END,
        actor_id=books["owner_id"],
    )

    wb, ctx = _pack(db_session, books)
    assert ctx.sealed is True
    assert "As closed" in str(wb["Summary"].cell(row=3, column=2).value)


def test_the_filename_says_which_it_is(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    _, ctx = _pack(db_session, books)
    assert month_pack.month_pack_filename(ctx).endswith("-live.xlsx")

    close_period(
        db_session,
        books["entity_id"],
        lock_kind=PeriodLockKind.MONTH,
        anchor_date=JUNE_END,
        actor_id=books["owner_id"],
    )
    _, sealed_ctx = _pack(db_session, books)
    assert month_pack.month_pack_filename(sealed_ctx).endswith("-as-closed.xlsx")


def test_a_quiet_period_still_produces_a_readable_file(db_session, books):
    """Nothing traded — the pack must open, not crash or come out blank."""
    wb, _ = _pack(db_session, books)
    assert "Summary" in wb.sheetnames
    assert "General ledger" in wb.sheetnames


def test_the_ledger_sheet_names_accounts_not_ids(db_session, books):
    """Journal lines carry only an account id; a raw UUID is useless to a
    partner, so names are resolved before writing."""
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    wb, _ = _pack(db_session, books)

    ledger = wb["General ledger"]
    labels = [
        str(ledger.cell(row=r, column=5).value)
        for r in range(4, ledger.max_row + 1)
    ]
    assert any(SALES_REVENUE_CODE in label for label in labels)
    assert not any(label.count("-") == 4 for label in labels if label != "None")


def test_amounts_are_lira_not_kurus(db_session, books):
    """A column of raw kuruş can't be checked against a statement without
    dividing every figure by 100 by hand (2026-07-29)."""
    _sale(db_session, books, date(2026, 6, 10), 123_456)
    wb, _ = _pack(db_session, books)

    summary = wb["Summary"]
    values = [
        summary.cell(row=r, column=2).value for r in range(1, summary.max_row + 1)
    ]
    assert 1234.56 in values, "1.234,56 ₺ should read as 1234.56, not 123456"
    assert 123_456 not in values


def test_money_stays_a_number_so_excel_can_total_it(db_session, books):
    """Formatting as text would look right and break every SUM()."""
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    wb, _ = _pack(db_session, books)

    summary = wb["Summary"]
    money = [
        summary.cell(row=r, column=2)
        for r in range(1, summary.max_row + 1)
        if isinstance(summary.cell(row=r, column=2).value, (int, float))
    ]
    assert money, "expected at least one numeric money cell"
    assert all(cell.number_format == "#,##0.00" for cell in money)


def test_the_pack_shows_foreign_currency_held(db_session, books):
    """It was missing entirely — 'what you hold' wasn't answering the question."""
    wb, _ = _pack(db_session, books)
    assert "Foreign currency" in wb.sheetnames

    fx = wb["Foreign currency"]
    heading = str(fx.cell(row=1, column=1).value)
    assert "Foreign currency held" in heading


def test_the_summary_counts_forex_in_what_you_hold(db_session, books):
    _sale(db_session, books, date(2026, 6, 10), 100_000)
    wb, _ = _pack(db_session, books)

    summary = wb["Summary"]
    labels = [
        str(summary.cell(row=r, column=1).value)
        for r in range(1, summary.max_row + 1)
    ]
    assert any("Foreign currency" in label for label in labels)


def _buy_usd(db_session, books, *, native: int, try_cost: int, on: date):
    wallet = banking_service.create_money_account(
        db_session,
        books["entity_id"],
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency="USD",
            name="USD Wallet",
        ),
    )
    drawers = banking_service.list_money_accounts(
        db_session,
        books["entity_id"],
        account_kind=MoneyAccountKind.CASH,
    )[0]
    drawer = drawers[0]
    fx_posting.post_fx_purchase(
        db_session,
        books["entity_id"],
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=native,
        try_cost_kurus=try_cost,
        purchase_date=on,
        description="Buy USD for pack",
        actor_id=books["owner_id"],
    )
    return wallet


def test_foreign_currency_sheet_shows_native_quantity_and_try_cost(db_session, books):
    """Partners need the real USD/EUR held — not only a lira book-cost line."""
    _buy_usd(db_session, books, native=10_000, try_cost=350_000, on=date(2026, 6, 5))
    wb, _ = _pack(db_session, books)

    fx = wb["Foreign currency"]
    natives = [
        fx.cell(row=r, column=3).value for r in range(1, fx.max_row + 1)
    ]
    try_costs = [
        fx.cell(row=r, column=4).value for r in range(1, fx.max_row + 1)
    ]
    assert 100.0 in natives  # $100.00, not 10000 kuruş-style cents left raw
    assert 3500.0 in try_costs  # ₺3.500,00 book cost


def test_each_fx_wallet_gets_a_movement_book(db_session, books):
    wallet = _buy_usd(
        db_session, books, native=10_000, try_cost=350_000, on=date(2026, 6, 5)
    )
    wb, _ = _pack(db_session, books)

    sheet_name = next(n for n in wb.sheetnames if n.startswith("FX — "))
    assert wallet.name.split()[0] in sheet_name or "USD" in sheet_name

    book = wb[sheet_name]
    types = [
        str(book.cell(row=r, column=2).value)
        for r in range(1, book.max_row + 1)
    ]
    assert any("purchase" in t for t in types)
    natives = [
        book.cell(row=r, column=4).value for r in range(1, book.max_row + 1)
    ]
    assert 100.0 in natives


def test_fx_staff_salary_is_not_labelled_as_lira(db_session, books):
    """FX amount_minor is foreign cents — writing it under Amount (₺) lied."""
    _buy_usd(db_session, books, native=200_000, try_cost=7_000_000, on=date(2026, 6, 1))
    with entity_context(db_session, books["entity_id"]):
        employee = Employee(name="FX Cook", pay_currency=PayCurrency.USD)
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
        description="USD salary",
        actor_id=books["owner_id"],
        period_year=2026,
        period_month=6,
    )

    wb, _ = _pack(db_session, books)
    salaries = wb["Salaries"]
    headers = [
        salaries.cell(row=5, column=c).value for c in range(1, 8)
    ]
    assert headers[4] == "Currency"
    assert headers[5] == "Amount"
    assert headers[5] != money_header()
    assert headers[6] == money_header("TRY cost")

    currencies = [
        salaries.cell(row=r, column=5).value
        for r in range(6, salaries.max_row + 1)
    ]
    amounts = [
        salaries.cell(row=r, column=6).value
        for r in range(6, salaries.max_row + 1)
    ]
    assert "USD" in currencies
    assert 1000.0 in amounts  # $1,000.00 — must not appear as ₺1.000,00 under a ₺ header


def test_an_unknown_entity_is_a_lookup_error(db_session):
    with pytest.raises(LookupError):
        month_pack.build_month_pack_xlsx(
            db_session, uuid.uuid4(), JUNE_START, JUNE_END
        )
