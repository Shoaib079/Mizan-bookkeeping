"""Cash drawer — movements, EOD close, over/short GL (Phase 5 Slice 1)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.cash import posting as cash_posting
from app.core.chart_of_accounts.default_chart import CASH_OVER_SHORT_CODE, SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.cash.models import CashDrawerSession, CashDrawerSessionStatus, CashMovementDirection


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _cash_account(db_session, entity_id):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )


@pytest.fixture
def cash_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = _cash_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "accounts": accounts,
    }


def test_cash_in_posts_gl_dr_cash_cr_offset(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]

    result = cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=date(2026, 4, 1),
        direction=CashMovementDirection.IN,
        amount_kurus=250_000,
        offset_account_id=revenue_id,
        description="Cash sales",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.CASH_MOVEMENT
    assert result.session.status == CashDrawerSessionStatus.OPEN

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[drawer.gl_account_id].amount_kurus == 250_000
    assert by_account[drawer.gl_account_id].side == AccountNormalBalance.DEBIT
    assert by_account[revenue_id].side == AccountNormalBalance.CREDIT


def test_cash_out_posts_gl_dr_offset_cr_cash(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]
    rent_id = cash_setup["accounts"]["5000"]

    cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=date(2026, 4, 1),
        direction=CashMovementDirection.IN,
        amount_kurus=100_000,
        offset_account_id=revenue_id,
        description="Float",
        actor_id=ACTOR_ID,
    )

    result = cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=date(2026, 4, 1),
        direction=CashMovementDirection.OUT,
        amount_kurus=30_000,
        offset_account_id=rent_id,
        description="Petty cash rent",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[rent_id].side == AccountNormalBalance.DEBIT
    assert by_account[drawer.gl_account_id].side == AccountNormalBalance.CREDIT


def test_eod_close_short_posts_dr_over_short_cr_cash(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]
    over_short_id = cash_setup["accounts"][CASH_OVER_SHORT_CODE]

    movement = cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=date(2026, 4, 2),
        direction=CashMovementDirection.IN,
        amount_kurus=100_000,
        offset_account_id=revenue_id,
        description="Day sales",
        actor_id=ACTOR_ID,
    )

    close = cash_posting.close_cash_drawer_session(
        db_session,
        entity_id,
        session_id=movement.session.id,
        counted_balance_kurus=95_000,
        actor_id=ACTOR_ID,
    )

    assert close.session.status == CashDrawerSessionStatus.CLOSED
    assert close.session.expected_balance_kurus == 100_000
    assert close.session.over_short_kurus == -5_000
    assert close.close_journal_entry is not None
    assert close.close_journal_entry.source == JournalEntrySource.CASH_DRAWER_CLOSE

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == close.close_journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}
        cash_balance = banking_service.gl_balance_kurus(
            db_session,
            drawer.gl_account_id,
            AccountNormalBalance.DEBIT,
        )

    assert by_account[over_short_id].amount_kurus == 5_000
    assert by_account[over_short_id].side == AccountNormalBalance.DEBIT
    assert by_account[drawer.gl_account_id].side == AccountNormalBalance.CREDIT
    assert cash_balance == 95_000


def test_eod_close_over_posts_dr_cash_cr_over_short(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]
    over_short_id = cash_setup["accounts"][CASH_OVER_SHORT_CODE]

    movement = cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=date(2026, 4, 3),
        direction=CashMovementDirection.IN,
        amount_kurus=50_000,
        offset_account_id=revenue_id,
        description="Day sales",
        actor_id=ACTOR_ID,
    )

    close = cash_posting.close_cash_drawer_session(
        db_session,
        entity_id,
        session_id=movement.session.id,
        counted_balance_kurus=52_000,
        actor_id=ACTOR_ID,
    )

    assert close.session.over_short_kurus == 2_000

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == close.close_journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}
        cash_balance = banking_service.gl_balance_kurus(
            db_session,
            drawer.gl_account_id,
            AccountNormalBalance.DEBIT,
        )

    assert by_account[drawer.gl_account_id].side == AccountNormalBalance.DEBIT
    assert by_account[over_short_id].side == AccountNormalBalance.CREDIT
    assert cash_balance == 52_000


def test_eod_close_exact_count_no_over_short_journal(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]

    movement = cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=date(2026, 4, 4),
        direction=CashMovementDirection.IN,
        amount_kurus=80_000,
        offset_account_id=revenue_id,
        description="Day sales",
        actor_id=ACTOR_ID,
    )

    close = cash_posting.close_cash_drawer_session(
        db_session,
        entity_id,
        session_id=movement.session.id,
        counted_balance_kurus=80_000,
        actor_id=ACTOR_ID,
    )

    assert close.close_journal_entry is None
    assert close.session.over_short_kurus == 0


def test_movement_rejected_after_close(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]

    movement = cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=date(2026, 4, 5),
        direction=CashMovementDirection.IN,
        amount_kurus=10_000,
        offset_account_id=revenue_id,
        description="Sales",
        actor_id=ACTOR_ID,
    )

    cash_posting.close_cash_drawer_session(
        db_session,
        entity_id,
        session_id=movement.session.id,
        counted_balance_kurus=10_000,
        actor_id=ACTOR_ID,
    )

    with pytest.raises(cash_posting.InvalidCashDrawerError, match="closed"):
        cash_posting.post_cash_movement(
            db_session,
            entity_id,
            money_account_id=drawer.id,
            movement_date=date(2026, 4, 5),
            direction=CashMovementDirection.IN,
            amount_kurus=1_000,
            offset_account_id=revenue_id,
            description="Late entry",
            actor_id=ACTOR_ID,
        )


def test_bank_account_rejected_for_cash_movement(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]
    bank = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name="Bank"),
    )

    with pytest.raises(cash_posting.InvalidCashDrawerError, match="cash drawer"):
        cash_posting.post_cash_movement(
            db_session,
            entity_id,
            money_account_id=bank.id,
            movement_date=date(2026, 4, 6),
            direction=CashMovementDirection.IN,
            amount_kurus=1_000,
            offset_account_id=revenue_id,
            description="Wrong account",
            actor_id=ACTOR_ID,
        )


def test_cross_entity_isolation(db_session, restaurant_a, restaurant_b) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    seed_default_chart(db_session, restaurant_b.id)
    drawer_a = _cash_account(db_session, restaurant_a.id)

    with entity_context(db_session, restaurant_a.id):
        revenue_a = db_session.scalar(select(Account).where(Account.code == SALES_REVENUE_CODE))

    cash_posting.post_cash_movement(
        db_session,
        restaurant_a.id,
        money_account_id=drawer_a.id,
        movement_date=date(2026, 4, 7),
        direction=CashMovementDirection.IN,
        amount_kurus=5_000,
        offset_account_id=revenue_a.id,
        description="Entity A cash",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_b.id):
        session_count = db_session.scalar(select(func.count()).select_from(CashDrawerSession))
        journal_count = db_session.scalar(select(func.count()).select_from(JournalEntry))

    assert session_count == 0
    assert journal_count == 0


def test_cash_drawer_api_e2e(client: TestClient, db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]

    movement_resp = client.post(
        f"/entities/{entity_id}/cash/movements",
        json={
            "money_account_id": str(drawer.id),
            "movement_date": "2026-04-10",
            "direction": "in",
            "amount_kurus": 120_000,
            "offset_account_id": str(revenue_id),
            "description": "API cash in",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert movement_resp.status_code == 201
    movement = movement_resp.json()
    session_id = movement["session_id"]

    detail_resp = client.get(f"/entities/{entity_id}/cash/drawer-sessions/{session_id}")
    assert detail_resp.status_code == 200
    assert len(detail_resp.json()["movements"]) == 1

    close_resp = client.post(
        f"/entities/{entity_id}/cash/drawer-sessions/{session_id}/close",
        json={
            "counted_balance_kurus": 118_000,
            "actor_id": str(ACTOR_ID),
        },
    )
    assert close_resp.status_code == 200
    closed = close_resp.json()
    assert closed["session"]["status"] == "closed"
    assert closed["close_journal_entry_id"] is not None

    list_resp = client.get(f"/entities/{entity_id}/cash/drawer-sessions")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    blocked_resp = client.post(
        f"/entities/{entity_id}/cash/movements",
        json={
            "money_account_id": str(drawer.id),
            "movement_date": "2026-04-10",
            "direction": "in",
            "amount_kurus": 1_000,
            "offset_account_id": str(revenue_id),
            "description": "After close",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert blocked_resp.status_code == 422
