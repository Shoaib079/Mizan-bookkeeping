"""Manual daily sales — typed cash + card without POS photo (Phase 8.7 D3)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import CARD_SALES_CLEARING_CODE, SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.pos import daily_summary_service
from app.features.pos.models import PosDailySummaryStatus
from app.features.pos.schema import ManualDailySalesRequest

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
SALES_DATE = date(2026, 6, 23)


def _setup(db_session, entity):
    seed_default_chart(db_session, entity.id)
    drawer = banking_service.create_money_account(
        db_session,
        entity.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, entity.id):
        accounts = {a.code: a for a in db_session.scalars(select(Account))}
    return drawer, accounts


def _gl_balance(db_session, entity_id, account_id, normal: AccountNormalBalance) -> int:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.account_id == account_id)
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


def test_manual_cash_and_card_posts(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    revenue_id = accounts[SALES_REVENUE_CODE].id
    clearing_id = accounts[CARD_SALES_CLEARING_CODE].id
    drawer_gl_id = drawer.gl_account_id

    result = daily_summary_service.create_manual_daily_sales(
        db_session,
        restaurant_a.id,
        ManualDailySalesRequest(
            sales_date=SALES_DATE,
            cash_kurus=50_000,
            card_kurus=30_000,
            money_account_id=drawer.id,
            actor_id=ACTOR_ID,
        ),
    )

    assert result.status == PosDailySummaryStatus.POSTED.value
    assert result.cash_kurus == 50_000
    assert result.card_kurus == 30_000

    assert _gl_balance(db_session, restaurant_a.id, revenue_id, AccountNormalBalance.CREDIT) == 80_000
    assert _gl_balance(db_session, restaurant_a.id, clearing_id, AccountNormalBalance.DEBIT) == 30_000
    assert (
        _gl_balance(db_session, restaurant_a.id, drawer_gl_id, AccountNormalBalance.DEBIT)
        == 50_000
    )


def test_manual_cash_only(db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    revenue_id = accounts[SALES_REVENUE_CODE].id

    result = daily_summary_service.create_manual_daily_sales(
        db_session,
        restaurant_a.id,
        ManualDailySalesRequest(
            sales_date=date(2026, 6, 24),
            cash_kurus=25_000,
            card_kurus=0,
            money_account_id=drawer.id,
            actor_id=ACTOR_ID,
        ),
    )

    assert result.status == PosDailySummaryStatus.POSTED.value
    assert _gl_balance(db_session, restaurant_a.id, revenue_id, AccountNormalBalance.CREDIT) == 25_000


def test_zero_sales_rejected(db_session, restaurant_a) -> None:
    drawer, _ = _setup(db_session, restaurant_a)

    with pytest.raises(daily_summary_service.PosDailySummaryConfirmError):
        daily_summary_service.create_manual_daily_sales(
            db_session,
            restaurant_a.id,
            ManualDailySalesRequest(
                sales_date=SALES_DATE,
                cash_kurus=0,
                card_kurus=0,
                money_account_id=drawer.id,
                actor_id=ACTOR_ID,
            ),
        )


def test_duplicate_date_rejected(db_session, restaurant_a) -> None:
    drawer, _ = _setup(db_session, restaurant_a)

    daily_summary_service.create_manual_daily_sales(
        db_session,
        restaurant_a.id,
        ManualDailySalesRequest(
            sales_date=SALES_DATE,
            cash_kurus=10_000,
            card_kurus=5_000,
            money_account_id=drawer.id,
            actor_id=ACTOR_ID,
        ),
    )

    with pytest.raises(daily_summary_service.PosDailySummaryConfirmError):
        daily_summary_service.create_manual_daily_sales(
            db_session,
            restaurant_a.id,
            ManualDailySalesRequest(
                sales_date=SALES_DATE,
                cash_kurus=20_000,
                card_kurus=0,
                money_account_id=drawer.id,
                actor_id=ACTOR_ID,
            ),
        )


def test_manual_daily_sales_via_api(client, db_session, restaurant_a) -> None:
    drawer, accounts = _setup(db_session, restaurant_a)
    revenue_id = accounts[SALES_REVENUE_CODE].id

    response = client.post(
        f"/entities/{restaurant_a.id}/pos/manual-daily-sales",
        json={
            "sales_date": "2026-06-25",
            "cash_kurus": 40_000,
            "card_kurus": 10_000,
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "posted"
    assert _gl_balance(db_session, restaurant_a.id, revenue_id, AccountNormalBalance.CREDIT) == 50_000
