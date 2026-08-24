"""Sales summary — cash/card/delivery on posted 4000; prior = full prior month."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.cash.posting import post_cash_movement
from app.core.chart_of_accounts.default_chart import (
    GROUP_SALES_REVENUE_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine, JournalEntrySource, JournalEntryStatus
from app.core.ledger.posting import PostingLine, post_journal_entry, void_journal_entry
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.cash.models import CashMovementDirection
from app.features.delivery.schema import DeliveryReportCreate, DeliveryReportPostRequest
from app.features.delivery import service as delivery_service
from app.features.reports.sales_summary import (
    full_calendar_month_before,
    get_sales_summary,
)
from tests.delivery_helpers import (
    ACTOR_ID,
    delivery_setup as build_delivery_setup,
    period_ending_on,
)


@pytest.fixture
def sales_summary_setup(db_session, restaurant_a):
    setup = build_delivery_setup(
        db_session, restaurant_a.id, platform_names=("Getir",)
    )
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    setup["drawer"] = drawer
    setup["accounts"] = accounts
    setup["getir"] = setup["platforms"]["Getir"]
    return setup


def _post_cash(db_session, setup, *, on: date, amount: int) -> None:
    post_cash_movement(
        db_session,
        setup["entity_id"],
        money_account_id=setup["drawer"].id,
        movement_date=on,
        direction=CashMovementDirection.IN,
        amount_kurus=amount,
        offset_account_id=setup["accounts"][SALES_REVENUE_CODE],
        description="Cash sales",
        actor_id=ACTOR_ID,
    )


def _post_card(db_session, setup, *, on: date, amount: int):
    return pos_posting.post_card_sales_batch(
        db_session,
        setup["entity_id"],
        sales_date=on,
        gross_amount_kurus=amount,
        description="Card sales",
        actor_id=ACTOR_ID,
    )


def _post_delivery(db_session, setup, *, on: date, amount: int) -> None:
    period_start, period_end = period_ending_on(on)
    created = delivery_service.create_delivery_report(
        db_session,
        setup["entity_id"],
        DeliveryReportCreate(
            delivery_platform_id=setup["getir"].id,
            period_start=period_start,
            period_end=period_end,
            gross_kurus=amount,
            description="Delivery",
            actor_id=ACTOR_ID,
        ),
    )
    delivery_service.post_delivery_report_intake(
        db_session,
        setup["entity_id"],
        created.id,
        DeliveryReportPostRequest(actor_id=ACTOR_ID),
    )


def _posted_4000_total(db_session, entity_id, from_date: date, to_date: date) -> int:
    from app.core.ledger.models import JournalEntry

    with entity_context(db_session, entity_id):
        sales_id = db_session.scalar(
            select(Account.id).where(Account.code == SALES_REVENUE_CODE)
        )
        return int(
            db_session.scalar(
                select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0))
                .select_from(JournalEntryLine)
                .join(JournalEntry, JournalEntry.id == JournalEntryLine.journal_entry_id)
                .where(
                    JournalEntry.status == JournalEntryStatus.POSTED.value,
                    JournalEntry.entry_date >= from_date,
                    JournalEntry.entry_date <= to_date,
                    JournalEntryLine.account_id == sales_id,
                    JournalEntryLine.side == AccountNormalBalance.CREDIT,
                )
            )
            or 0
        )


def test_full_calendar_month_before_mid_month() -> None:
    assert full_calendar_month_before(date(2026, 8, 24)) == (
        date(2026, 7, 1),
        date(2026, 7, 31),
    )


def test_sales_summary_totals_tie_to_posted_4000(db_session, sales_summary_setup) -> None:
    setup = sales_summary_setup
    entity_id = setup["entity_id"]
    _post_cash(db_session, setup, on=date(2026, 8, 5), amount=100_00)
    _post_card(db_session, setup, on=date(2026, 8, 10), amount=250_00)
    _post_delivery(db_session, setup, on=date(2026, 8, 12), amount=80_00)

    report = get_sales_summary(
        db_session, entity_id, date(2026, 8, 1), date(2026, 8, 24)
    )
    assert report.current.cash_kurus == 100_00
    assert report.current.card_kurus == 250_00
    assert report.current.delivery_kurus == 80_00
    assert report.current.total_kurus == 430_00
    assert report.current.total_kurus == _posted_4000_total(
        db_session, entity_id, date(2026, 8, 1), date(2026, 8, 24)
    )
    assert report.prior.from_date == date(2026, 7, 1)
    assert report.prior.to_date == date(2026, 7, 31)
    assert report.prior.full_month is True


def test_prior_column_is_full_calendar_month_even_mid_month(
    db_session, sales_summary_setup
) -> None:
    setup = sales_summary_setup
    _post_cash(db_session, setup, on=date(2026, 7, 2), amount=50_00)
    _post_card(db_session, setup, on=date(2026, 7, 30), amount=70_00)
    _post_cash(db_session, setup, on=date(2026, 8, 3), amount=10_00)

    report = get_sales_summary(
        db_session, setup["entity_id"], date(2026, 8, 1), date(2026, 8, 24)
    )
    assert report.prior.cash_kurus == 50_00
    assert report.prior.card_kurus == 70_00
    assert report.prior.total_kurus == 120_00
    assert report.current.cash_kurus == 10_00
    # Same-length prior (1–24 Jul) would miss the Jul 30 card sale.
    same_length = get_sales_summary(
        db_session, setup["entity_id"], date(2026, 7, 1), date(2026, 7, 24)
    )
    assert same_length.current.card_kurus == 0
    assert report.prior.card_kurus == 70_00


def test_voided_day_excluded(db_session, sales_summary_setup) -> None:
    setup = sales_summary_setup
    entity_id = setup["entity_id"]
    batch = _post_card(db_session, setup, on=date(2026, 8, 8), amount=500_00)
    entry_id = batch.journal_entry.id
    _post_cash(db_session, setup, on=date(2026, 8, 9), amount=40_00)

    void_journal_entry(
        db_session,
        entity_id,
        entry_id,
        actor_id=ACTOR_ID,
        reason="test void",
    )

    report = get_sales_summary(
        db_session, entity_id, date(2026, 8, 1), date(2026, 8, 24)
    )
    assert report.current.card_kurus == 0
    assert report.current.cash_kurus == 40_00
    assert report.current.total_kurus == 40_00


def test_group_sales_4300_excluded(db_session, sales_summary_setup) -> None:
    setup = sales_summary_setup
    entity_id = setup["entity_id"]
    _post_cash(db_session, setup, on=date(2026, 8, 4), amount=100_00)

    group_id = setup["accounts"][GROUP_SALES_REVENUE_CODE]
    cash_gl = setup["drawer"].gl_account_id
    post_journal_entry(
        db_session,
        entity_id,
        date(2026, 8, 6),
        "Group sale on 4300",
        [
            PostingLine(
                account_id=cash_gl,
                amount_kurus=999_00,
                side=AccountNormalBalance.DEBIT,
            ),
            PostingLine(
                account_id=group_id,
                amount_kurus=999_00,
                side=AccountNormalBalance.CREDIT,
            ),
        ],
        actor_id=ACTOR_ID,
        source=JournalEntrySource.MANUAL,
    )

    report = get_sales_summary(
        db_session, entity_id, date(2026, 8, 1), date(2026, 8, 24)
    )
    assert report.current.cash_kurus == 100_00
    assert report.current.total_kurus == 100_00


def test_sales_summary_http(client: TestClient, db_session, sales_summary_setup) -> None:
    setup = sales_summary_setup
    entity_id = setup["entity_id"]
    _post_cash(db_session, setup, on=date(2026, 8, 5), amount=10_00)
    _post_card(db_session, setup, on=date(2026, 8, 6), amount=20_00)

    res = client.get(
        f"/entities/{entity_id}/reports/sales-summary",
        params={"from": "2026-08-01", "to": "2026-08-24"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["current"]["cash_kurus"] == 10_00
    assert body["current"]["card_kurus"] == 20_00
    assert body["current"]["total_kurus"] == 30_00
    assert body["prior"]["from_date"] == "2026-07-01"
    assert body["prior"]["to_date"] == "2026-07-31"

    export = client.get(
        f"/entities/{entity_id}/reports/sales-summary/export",
        params={"from": "2026-08-01", "to": "2026-08-24"},
    )
    assert export.status_code == 200, export.text
    assert (
        "spreadsheetml"
        in export.headers.get("content-type", "")
        or export.headers.get("content-type", "").endswith("sheet")
        or len(export.content) > 100
    )
