"""Cash drawer — movements, EOD close, over/short GL, optional session (Phase 5 / 11.13)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.auth.types import EntityRole
from app.core.cash import posting as cash_posting
from app.core.cash.errors import DrawerDayClosedError, DrawerUnlockRequiredError
from app.core.cash.guards import reopen_cash_drawer_session
from app.core.chart_of_accounts.default_chart import CASH_OVER_SHORT_CODE, SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.pos.daily_summary_posting import confirm_pos_daily_summary
from app.db.session import entity_context
from app.features.auth import service as auth_service
from app.features.auth.schema import MembershipCreate, UserCreate
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.cash.models import (
    CashDrawerAuditAction,
    CashDrawerAuditEvent,
    CashDrawerSession,
    CashDrawerSessionStatus,
    CashMovement,
    CashMovementDirection,
)
from app.features.pos.models import PosDailySummary, PosDailySummaryStatus


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _cash_account(db_session, entity_id):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )


def _ensure_actor(db_session, entity_id: uuid.UUID) -> uuid.UUID:
    user = auth_service.create_user(
        db_session,
        UserCreate(email=f"actor-{entity_id.hex[:8]}@test.local", display_name="Actor"),
    )
    auth_service.add_entity_member(
        db_session,
        entity_id,
        MembershipCreate(user_id=user.id, role=EntityRole.CASHIER),
    )
    return user.id


def _ensure_owner(db_session, entity_id: uuid.UUID) -> uuid.UUID:
    user = auth_service.create_user(
        db_session,
        UserCreate(email=f"owner-{entity_id.hex[:8]}@test.local", display_name="Owner"),
    )
    auth_service.add_entity_member(
        db_session,
        entity_id,
        MembershipCreate(user_id=user.id, role=EntityRole.OWNER),
    )
    return user.id


@pytest.fixture
def cash_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = _cash_account(db_session, restaurant_a.id)
    actor_id = _ensure_actor(db_session, restaurant_a.id)
    owner_id = _ensure_owner(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "accounts": accounts,
        "actor_id": actor_id,
        "owner_id": owner_id,
    }


def _close_drawer_day(
    db_session,
    entity_id,
    *,
    drawer_id,
    session_date: date,
    counted_balance_kurus: int,
    actor_id: uuid.UUID,
) -> cash_posting.CashDrawerCloseResult:
    return cash_posting.close_cash_drawer_session(
        db_session,
        entity_id,
        money_account_id=drawer_id,
        session_date=session_date,
        counted_balance_kurus=counted_balance_kurus,
        actor_id=actor_id,
    )


def test_cash_in_posts_gl_dr_cash_cr_offset(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    actor_id = cash_setup["actor_id"]
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
        actor_id=actor_id,
    )

    assert result.journal_entry.source == JournalEntrySource.CASH_MOVEMENT
    assert result.session is None
    assert result.cash_movement.session_id is None

    with entity_context(db_session, entity_id):
        session_count = db_session.scalar(select(func.count()).select_from(CashDrawerSession))
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert session_count == 0
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
        actor_id=cash_setup["actor_id"],
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
        actor_id=cash_setup["actor_id"],
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

    cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=date(2026, 4, 2),
        direction=CashMovementDirection.IN,
        amount_kurus=100_000,
        offset_account_id=revenue_id,
        description="Day sales",
        actor_id=cash_setup["actor_id"],
    )

    close = _close_drawer_day(
        db_session,
        entity_id,
        drawer_id=drawer.id,
        session_date=date(2026, 4, 2),
        counted_balance_kurus=95_000,
        actor_id=cash_setup["actor_id"],
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
        linked = db_session.scalar(
            select(func.count()).select_from(CashMovement).where(
                CashMovement.session_id == close.session.id
            )
        )

    assert linked == 1
    assert by_account[over_short_id].amount_kurus == 5_000
    assert by_account[over_short_id].side == AccountNormalBalance.DEBIT
    assert by_account[drawer.gl_account_id].side == AccountNormalBalance.CREDIT
    assert cash_balance == 95_000


def test_eod_close_over_posts_dr_cash_cr_over_short(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]
    over_short_id = cash_setup["accounts"][CASH_OVER_SHORT_CODE]

    cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=date(2026, 4, 3),
        direction=CashMovementDirection.IN,
        amount_kurus=50_000,
        offset_account_id=revenue_id,
        description="Day sales",
        actor_id=cash_setup["actor_id"],
    )

    close = _close_drawer_day(
        db_session,
        entity_id,
        drawer_id=drawer.id,
        session_date=date(2026, 4, 3),
        counted_balance_kurus=52_000,
        actor_id=cash_setup["actor_id"],
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

    cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=date(2026, 4, 4),
        direction=CashMovementDirection.IN,
        amount_kurus=80_000,
        offset_account_id=revenue_id,
        description="Day sales",
        actor_id=cash_setup["actor_id"],
    )

    close = _close_drawer_day(
        db_session,
        entity_id,
        drawer_id=drawer.id,
        session_date=date(2026, 4, 4),
        counted_balance_kurus=80_000,
        actor_id=cash_setup["actor_id"],
    )

    assert close.close_journal_entry is None
    assert close.session.over_short_kurus == 0


def test_movement_rejected_after_close_without_owner(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]
    movement_date = date(2026, 4, 5)

    cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=movement_date,
        direction=CashMovementDirection.IN,
        amount_kurus=10_000,
        offset_account_id=revenue_id,
        description="Sales",
        actor_id=cash_setup["actor_id"],
    )

    close = _close_drawer_day(
        db_session,
        entity_id,
        drawer_id=drawer.id,
        session_date=movement_date,
        counted_balance_kurus=10_000,
        actor_id=cash_setup["actor_id"],
    )

    with pytest.raises(DrawerDayClosedError, match="owner unlock required"):
        cash_posting.post_cash_movement(
            db_session,
            entity_id,
            money_account_id=drawer.id,
            movement_date=movement_date,
            direction=CashMovementDirection.IN,
            amount_kurus=1_000,
            offset_account_id=revenue_id,
            description="Late entry",
            actor_id=cash_setup["actor_id"],
        )

    assert close.session.status == CashDrawerSessionStatus.CLOSED


def test_owner_reopen_then_post_succeeds_with_audit(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]
    owner_id = cash_setup["owner_id"]
    movement_date = date(2026, 4, 8)

    cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=movement_date,
        direction=CashMovementDirection.IN,
        amount_kurus=20_000,
        offset_account_id=revenue_id,
        description="Sales",
        actor_id=cash_setup["actor_id"],
    )
    close = _close_drawer_day(
        db_session,
        entity_id,
        drawer_id=drawer.id,
        session_date=movement_date,
        counted_balance_kurus=20_000,
        actor_id=cash_setup["actor_id"],
    )

    reopened = reopen_cash_drawer_session(
        db_session,
        entity_id,
        close.session.id,
        actor_id=owner_id,
        reason="Forgot late cash sale",
    )
    assert reopened.status == CashDrawerSessionStatus.OPEN
    assert reopened.reopen_reason == "Forgot late cash sale"

    with entity_context(db_session, entity_id):
        audits = list(
            db_session.scalars(
                select(CashDrawerAuditEvent).where(
                    CashDrawerAuditEvent.cash_drawer_session_id == close.session.id,
                    CashDrawerAuditEvent.action == CashDrawerAuditAction.REOPEN,
                )
            )
        )
    assert len(audits) == 1
    assert audits[0].reason == "Forgot late cash sale"

    result = cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=movement_date,
        direction=CashMovementDirection.IN,
        amount_kurus=2_000,
        offset_account_id=revenue_id,
        description="Late sale after reopen",
        actor_id=cash_setup["actor_id"],
    )
    assert result.cash_movement.amount_kurus == 2_000


def test_owner_post_with_unlock_reason_reopens_and_audits(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    revenue_id = cash_setup["accounts"][SALES_REVENUE_CODE]
    owner_id = cash_setup["owner_id"]
    movement_date = date(2026, 4, 9)

    cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=movement_date,
        direction=CashMovementDirection.IN,
        amount_kurus=15_000,
        offset_account_id=revenue_id,
        description="Sales",
        actor_id=cash_setup["actor_id"],
    )
    close = _close_drawer_day(
        db_session,
        entity_id,
        drawer_id=drawer.id,
        session_date=movement_date,
        counted_balance_kurus=15_000,
        actor_id=cash_setup["actor_id"],
    )

    with pytest.raises(DrawerUnlockRequiredError, match="period_unlock_reason"):
        cash_posting.post_cash_movement(
            db_session,
            entity_id,
            money_account_id=drawer.id,
            movement_date=movement_date,
            direction=CashMovementDirection.IN,
            amount_kurus=500,
            offset_account_id=revenue_id,
            description="Owner forgot reason",
            actor_id=owner_id,
        )

    cash_posting.post_cash_movement(
        db_session,
        entity_id,
        money_account_id=drawer.id,
        movement_date=movement_date,
        direction=CashMovementDirection.IN,
        amount_kurus=500,
        offset_account_id=revenue_id,
        description="Owner correction",
        actor_id=owner_id,
        period_unlock_reason="Missed coin float",
    )

    with entity_context(db_session, entity_id):
        session_row = db_session.get(CashDrawerSession, close.session.id)
        unlock_audits = list(
            db_session.scalars(
                select(CashDrawerAuditEvent).where(
                    CashDrawerAuditEvent.action == CashDrawerAuditAction.UNLOCK_WRITE
                )
            )
        )

    assert session_row is not None
    assert session_row.status == CashDrawerSessionStatus.OPEN
    assert len(unlock_audits) == 1
    assert unlock_audits[0].reason == "Missed coin float"


def test_daily_sales_cash_without_session(db_session, cash_setup) -> None:
    entity_id = cash_setup["entity_id"]
    drawer = cash_setup["drawer"]
    with entity_context(db_session, entity_id):
        summary = PosDailySummary(
            entity_id=entity_id,
            status=PosDailySummaryStatus.CONFIRMED.value,
            file_fingerprint="test-cash-no-session",
            summary_date=date(2026, 4, 11),
            cash_kurus=60_000,
            card_kurus=40_000,
            total_kurus=100_000,
            extraction_payload={"source": "test"},
        )
        db_session.add(summary)
        db_session.commit()
        db_session.refresh(summary)

    result = confirm_pos_daily_summary(
        db_session,
        entity_id,
        summary,
        money_account_id=drawer.id,
        cash_kurus=60_000,
        card_kurus=40_000,
        actor_id=cash_setup["actor_id"],
        description="Manual daily sales",
    )

    assert result.cash_movement is not None
    assert result.cash_movement.session_id is None
    with entity_context(db_session, entity_id):
        session_count = db_session.scalar(select(func.count()).select_from(CashDrawerSession))
    assert session_count == 0


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
            actor_id=cash_setup["actor_id"],
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
    owner_id = cash_setup["owner_id"]
    actor_id = cash_setup["actor_id"]
    movement_date = "2026-04-10"

    movement_resp = client.post(
        f"/entities/{entity_id}/cash/movements",
        json={
            "money_account_id": str(drawer.id),
            "movement_date": movement_date,
            "direction": "in",
            "amount_kurus": 120_000,
            "offset_account_id": str(revenue_id),
            "description": "API cash in",
            "actor_id": str(actor_id),
        },
    )
    assert movement_resp.status_code == 201
    movement = movement_resp.json()
    assert movement["session_id"] is None

    close_resp = client.post(
        f"/entities/{entity_id}/cash/drawer-sessions/close-day",
        json={
            "money_account_id": str(drawer.id),
            "session_date": movement_date,
            "counted_balance_kurus": 118_000,
            "actor_id": str(actor_id),
        },
    )
    assert close_resp.status_code == 200
    closed = close_resp.json()
    session_id = closed["session"]["id"]
    assert closed["session"]["status"] == "closed"
    assert closed["close_journal_entry_id"] is not None

    detail_resp = client.get(f"/entities/{entity_id}/cash/drawer-sessions/{session_id}")
    assert detail_resp.status_code == 200
    assert len(detail_resp.json()["movements"]) == 1

    list_resp = client.get(f"/entities/{entity_id}/cash/drawer-sessions")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1

    blocked_resp = client.post(
        f"/entities/{entity_id}/cash/movements",
        json={
            "money_account_id": str(drawer.id),
            "movement_date": movement_date,
            "direction": "in",
            "amount_kurus": 1_000,
            "offset_account_id": str(revenue_id),
            "description": "After close",
            "actor_id": str(actor_id),
        },
    )
    assert blocked_resp.status_code == 422
    assert "owner unlock required" in blocked_resp.json()["detail"]

    reopen_resp = client.post(
        f"/entities/{entity_id}/cash/drawer-sessions/{session_id}/reopen",
        json={
            "reason": "API reopen test",
            "actor_id": str(owner_id),
        },
    )
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["status"] == "open"

    after_reopen_resp = client.post(
        f"/entities/{entity_id}/cash/movements",
        json={
            "money_account_id": str(drawer.id),
            "movement_date": movement_date,
            "direction": "in",
            "amount_kurus": 1_000,
            "offset_account_id": str(revenue_id),
            "description": "After reopen",
            "actor_id": str(actor_id),
        },
    )
    assert after_reopen_resp.status_code == 201

    close_again = _close_drawer_day(
        db_session,
        entity_id,
        drawer_id=drawer.id,
        session_date=date.fromisoformat(movement_date),
        counted_balance_kurus=121_000,
        actor_id=cash_setup["actor_id"],
    )
    assert close_again.session.status == CashDrawerSessionStatus.CLOSED

    unlock_resp = client.post(
        f"/entities/{entity_id}/cash/movements",
        json={
            "money_account_id": str(drawer.id),
            "movement_date": movement_date,
            "direction": "in",
            "amount_kurus": 500,
            "offset_account_id": str(revenue_id),
            "description": "After owner unlock",
            "actor_id": str(owner_id),
            "period_unlock_reason": "API unlock test",
        },
    )
    assert unlock_resp.status_code == 201
