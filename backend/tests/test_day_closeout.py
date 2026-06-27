"""Day close-out — atomic sales + expenses (Phase 11 Slice 11.15)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import settings
from app.core.chart_of_accounts.default_chart import (
    GENERAL_EXPENSE_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.auth.types import EntityRole
from app.core.period_locks.models import PeriodLockKind
from app.core.period_locks.service import close_period
from app.db.session import entity_context
from app.features.auth import service as auth_service
from app.features.auth.schema import MembershipCreate, UserCreate
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.expenses.models import ExpenseEntry
from app.features.operations import day_closeout_service
from app.features.operations.schema import DayCloseoutExpenseLine, DayCloseoutRequest
from app.features.pos.models import PosDailySummary, PosDailySummaryStatus

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
CLOSEOUT_DATE = date(2026, 6, 20)


@pytest.fixture
def closeout_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    actor = auth_service.create_user(
        db_session,
        UserCreate(email="day-closeout@example.com", display_name="Closeout actor"),
    )
    auth_service.add_entity_member(
        db_session,
        restaurant_a.id,
        MembershipCreate(user_id=actor.id, role=EntityRole.OWNER),
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
        "drawer": drawer,
        "accounts": accounts,
        "actor_id": actor.id,
    }


def _closeout_payload(setup: dict, **overrides) -> dict:
    groceries_id = setup["accounts"][GENERAL_EXPENSE_CODE]
    actor_id = setup.get("actor_id", ACTOR_ID)
    base = {
        "sales_date": CLOSEOUT_DATE.isoformat(),
        "cash_kurus": 50_000,
        "card_kurus": 30_000,
        "money_account_id": str(setup["drawer"].id),
        "actor_id": str(actor_id),
        "expense_lines": [
            {
                "amount_kurus": 5_000,
                "expense_account_id": str(groceries_id),
                "item_description": "peynir",
            },
            {
                "amount_kurus": 2_000,
                "expense_account_id": str(groceries_id),
                "item_description": "domates",
            },
        ],
    }
    base.update(overrides)
    return base


def _summary_count(db_session, entity_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        return (
            db_session.scalar(select(func.count()).select_from(PosDailySummary)) or 0
        )


def _expense_count(db_session, entity_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        return db_session.scalar(select(func.count()).select_from(ExpenseEntry)) or 0


def _revenue_balance(db_session, entity_id: uuid.UUID, revenue_id: uuid.UUID) -> int:
    from app.core.chart_of_accounts.types import AccountNormalBalance
    from app.core.ledger.models import JournalEntryLine

    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.account_id == revenue_id)
            .group_by(JournalEntryLine.side)
        ).all()
        debits = credits = 0
        for side, total in rows:
            if side == AccountNormalBalance.DEBIT:
                debits = int(total or 0)
            else:
                credits = int(total or 0)
        return credits - debits


def test_day_closeout_happy_path_service(db_session, closeout_setup) -> None:
    setup = closeout_setup
    groceries_id = setup["accounts"][GENERAL_EXPENSE_CODE]
    revenue_id = setup["accounts"][SALES_REVENUE_CODE]

    result = day_closeout_service.post_day_closeout(
        db_session,
        setup["entity_id"],
        DayCloseoutRequest(
            sales_date=CLOSEOUT_DATE,
            cash_kurus=50_000,
            card_kurus=30_000,
            money_account_id=setup["drawer"].id,
            actor_id=setup["actor_id"],
            expense_lines=[
                DayCloseoutExpenseLine(
                    amount_kurus=5_000,
                    expense_account_id=groceries_id,
                    item_description="peynir",
                ),
                DayCloseoutExpenseLine(
                    amount_kurus=2_000,
                    expense_account_id=groceries_id,
                    item_description="domates",
                ),
            ],
        ),
    )

    assert result.pos_daily_summary_status == PosDailySummaryStatus.POSTED.value
    assert len(result.expenses) == 2
    assert _summary_count(db_session, setup["entity_id"]) == 1
    assert _expense_count(db_session, setup["entity_id"]) == 2
    assert _revenue_balance(db_session, setup["entity_id"], revenue_id) == 80_000


def test_day_closeout_rollback_on_bad_expense_account(db_session, closeout_setup) -> None:
    setup = closeout_setup
    revenue_id = setup["accounts"][SALES_REVENUE_CODE]
    bad_account_id = revenue_id

    with pytest.raises(day_closeout_service.DayCloseoutError, match="not an expense"):
        day_closeout_service.post_day_closeout(
            db_session,
            setup["entity_id"],
            DayCloseoutRequest(
                sales_date=date(2026, 6, 21),
                cash_kurus=10_000,
                card_kurus=0,
                money_account_id=setup["drawer"].id,
                actor_id=setup["actor_id"],
                expense_lines=[
                    DayCloseoutExpenseLine(
                        amount_kurus=1_000,
                        expense_account_id=bad_account_id,
                        item_description="bad",
                    ),
                ],
            ),
        )

    assert _summary_count(db_session, setup["entity_id"]) == 0
    assert _expense_count(db_session, setup["entity_id"]) == 0
    assert _revenue_balance(db_session, setup["entity_id"], revenue_id) == 0


def test_day_closeout_duplicate_date_no_partial_posts(
    db_session, closeout_setup
) -> None:
    setup = closeout_setup
    groceries_id = setup["accounts"][GENERAL_EXPENSE_CODE]

    day_closeout_service.post_day_closeout(
        db_session,
        setup["entity_id"],
        DayCloseoutRequest(
            sales_date=CLOSEOUT_DATE,
            cash_kurus=10_000,
            card_kurus=0,
            money_account_id=setup["drawer"].id,
            actor_id=setup["actor_id"],
            expense_lines=[],
        ),
    )

    with pytest.raises(day_closeout_service.DayCloseoutError):
        day_closeout_service.post_day_closeout(
            db_session,
            setup["entity_id"],
            DayCloseoutRequest(
                sales_date=CLOSEOUT_DATE,
                cash_kurus=20_000,
                card_kurus=0,
                money_account_id=setup["drawer"].id,
                actor_id=setup["actor_id"],
                expense_lines=[
                    DayCloseoutExpenseLine(
                        amount_kurus=1_000,
                        expense_account_id=groceries_id,
                        item_description="retry",
                    ),
                ],
            ),
        )

    assert _summary_count(db_session, setup["entity_id"]) == 1
    assert _expense_count(db_session, setup["entity_id"]) == 0


def test_day_closeout_via_api(client: TestClient, db_session, closeout_setup) -> None:
    setup = closeout_setup
    entity_id = setup["entity_id"]
    revenue_id = setup["accounts"][SALES_REVENUE_CODE]

    response = client.post(
        f"/entities/{entity_id}/operations/day-closeout",
        json=_closeout_payload(setup),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["pos_daily_summary_status"] == "posted"
    assert len(body["expenses"]) == 2
    assert _revenue_balance(db_session, entity_id, revenue_id) == 80_000


def test_day_closeout_period_lock_requires_unlock(
    client: TestClient, db_session, closeout_setup
) -> None:
    setup = closeout_setup
    entity_id = setup["entity_id"]
    locked_day = date(2026, 6, 22)

    close_period(
        db_session,
        entity_id,
        lock_kind=PeriodLockKind.DAY,
        anchor_date=locked_day,
        actor_id=setup["actor_id"],
    )

    blocked = client.post(
        f"/entities/{entity_id}/operations/day-closeout",
        json=_closeout_payload(
            setup,
            sales_date=locked_day.isoformat(),
            cash_kurus=15_000,
            card_kurus=0,
            expense_lines=[
                {
                    "amount_kurus": 1_000,
                    "expense_account_id": str(
                        setup["accounts"][GENERAL_EXPENSE_CODE]
                    ),
                    "item_description": "locked",
                },
            ],
        ),
    )
    assert blocked.status_code == 422
    assert "closed period" in blocked.json()["detail"].lower()
    assert _summary_count(db_session, entity_id) == 0
    assert _expense_count(db_session, entity_id) == 0

    allowed = client.post(
        f"/entities/{entity_id}/operations/day-closeout",
        json=_closeout_payload(
            setup,
            sales_date=locked_day.isoformat(),
            cash_kurus=15_000,
            card_kurus=0,
            period_unlock_reason="Owner close-out in locked day",
            expense_lines=[
                {
                    "amount_kurus": 1_000,
                    "expense_account_id": str(
                        setup["accounts"][GENERAL_EXPENSE_CODE]
                    ),
                    "item_description": "locked",
                },
            ],
        ),
    )
    assert allowed.status_code == 201, allowed.text
    assert _summary_count(db_session, entity_id) == 1
    assert _expense_count(db_session, entity_id) == 1


def test_day_closeout_idempotent_retry(
    client: TestClient, db_session, closeout_setup, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    setup = closeout_setup
    entity_id = setup["entity_id"]
    key = str(uuid.uuid4())
    url = f"/entities/{entity_id}/operations/day-closeout"
    payload = _closeout_payload(setup, sales_date="2026-06-23")
    headers = {"Idempotency-Key": key}

    first = client.post(url, json=payload, headers=headers)
    second = client.post(url, json=payload, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json() == second.json()
    assert _summary_count(db_session, entity_id) == 1
    assert _expense_count(db_session, entity_id) == 2
