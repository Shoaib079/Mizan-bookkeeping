"""Correct posted POS daily summaries — void linked JEs and repost (Phase 11 Slice 11.9)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import SALES_REVENUE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource, JournalEntryStatus
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.cash.models import CashMovement, CashMovementDirection
from app.features.pos.models import CardSalesBatch, PosDailySummary, PosDailySummaryStatus
from tests.auth_helpers import auth_headers

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "pos"
SAMPLE_SUMMARY = FIXTURES / "sample_summary.txt"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _cash_account(db_session, entity_id):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )


@pytest.fixture
def pos_correct_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = _cash_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "accounts": accounts,
    }


def _post_sample_summary(client, setup, *, headers: dict | None = None) -> dict:
    entity_id = setup["entity_id"]
    drawer = setup["drawer"]
    upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={"file": ("summary.txt", SAMPLE_SUMMARY.read_bytes(), "text/plain")},
        headers=headers or {},
    )
    assert upload.status_code == 201
    summary_id = upload.json()["id"]
    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
        },
        headers=headers or {},
    )
    assert confirm.status_code == 200
    return confirm.json()


def test_correct_changes_cash_card_voids_old_reposts_new(
    db_session, client, pos_correct_setup
) -> None:
    entity_id = pos_correct_setup["entity_id"]
    drawer = pos_correct_setup["drawer"]
    revenue_id = pos_correct_setup["accounts"][SALES_REVENUE_CODE]
    posted = _post_sample_summary(client, pos_correct_setup)
    summary_id = posted["id"]
    old_batch_id = posted["card_sales_batch_id"]
    old_cash_movement_id = posted["cash_movement_id"]

    correct = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/correct",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
            "cash_kurus": 200_000,
            "card_kurus": 300_000,
            "summary_date": "2026-06-22",
            "description": "Corrected daily sales",
        },
    )
    assert correct.status_code == 200
    body = correct.json()
    assert body["status"] == "posted"
    assert body["confirmed_cash_kurus"] == 200_000
    assert body["confirmed_card_kurus"] == 300_000
    assert body["total_kurus"] == 500_000
    assert body["card_sales_batch_id"] != old_batch_id
    assert body["cash_movement_id"] != old_cash_movement_id

    with entity_context(db_session, entity_id):
        old_batch = db_session.get(CardSalesBatch, uuid.UUID(old_batch_id))
        assert old_batch is not None
        old_card_je = db_session.get(JournalEntry, old_batch.journal_entry_id)
        assert old_card_je is not None
        assert old_card_je.status == JournalEntryStatus.VOIDED

        old_cash = db_session.get(CashMovement, uuid.UUID(old_cash_movement_id))
        assert old_cash is not None
        old_cash_je = db_session.get(JournalEntry, old_cash.journal_entry_id)
        assert old_cash_je is not None
        assert old_cash_je.status == JournalEntryStatus.VOIDED

        movements = db_session.scalars(
            select(CashMovement).order_by(CashMovement.created_at.asc())
        ).all()
        assert len(movements) == 3
        original_in, reversal_out, corrected_in = movements
        assert original_in.id == uuid.UUID(old_cash_movement_id)
        assert original_in.direction == CashMovementDirection.IN
        assert reversal_out.direction == CashMovementDirection.OUT
        assert reversal_out.amount_kurus == 150_000
        assert corrected_in.direction == CashMovementDirection.IN
        assert corrected_in.amount_kurus == 200_000

        card_jes = db_session.scalars(
            select(JournalEntry).where(JournalEntry.source == JournalEntrySource.CARD_SALES)
        ).all()
        active_card = [je for je in card_jes if je.status != JournalEntryStatus.VOIDED]
        assert len(active_card) == 1

        revenue_credit = int(
            db_session.scalar(
                select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0)).where(
                    JournalEntryLine.account_id == revenue_id,
                    JournalEntryLine.side == AccountNormalBalance.CREDIT,
                    JournalEntryLine.journal_entry_id.in_(
                        select(JournalEntry.id).where(
                            JournalEntry.status != JournalEntryStatus.VOIDED
                        )
                    ),
                )
            )
            or 0
        )
        assert revenue_credit == 500_000


def test_correct_changes_date(db_session, client, pos_correct_setup) -> None:
    entity_id = pos_correct_setup["entity_id"]
    drawer = pos_correct_setup["drawer"]
    posted = _post_sample_summary(client, pos_correct_setup)
    summary_id = posted["id"]

    correct = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/correct",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
            "cash_kurus": 150_000,
            "card_kurus": 350_000,
            "summary_date": "2026-06-23",
        },
    )
    assert correct.status_code == 200
    assert correct.json()["summary_date"] == "2026-06-23"

    with entity_context(db_session, entity_id):
        summary = db_session.get(PosDailySummary, uuid.UUID(summary_id))
        assert summary is not None
        assert summary.summary_date == date(2026, 6, 23)
        new_batch = db_session.get(CardSalesBatch, summary.card_sales_batch_id)
        assert new_batch is not None
        assert new_batch.sales_date == date(2026, 6, 23)


def test_correct_non_posted_summary_409(client, pos_correct_setup) -> None:
    entity_id = pos_correct_setup["entity_id"]
    drawer = pos_correct_setup["drawer"]
    upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={"file": ("summary.txt", SAMPLE_SUMMARY.read_bytes(), "text/plain")},
    )
    summary_id = upload.json()["id"]
    assert upload.json()["status"] == "draft"

    response = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/correct",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
            "cash_kurus": 150_000,
            "card_kurus": 350_000,
            "summary_date": "2026-06-22",
        },
    )
    assert response.status_code == 409


def test_correct_duplicate_posted_date_422(client, pos_correct_setup) -> None:
    entity_id = pos_correct_setup["entity_id"]
    drawer = pos_correct_setup["drawer"]
    first = _post_sample_summary(client, pos_correct_setup)

    second_upload = client.post(
        f"/entities/{entity_id}/pos/manual-daily-sales",
        json={
            "sales_date": "2026-06-23",
            "cash_kurus": 100_000,
            "card_kurus": 100_000,
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert second_upload.status_code == 201
    second_id = second_upload.json()["id"]

    response = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{first['id']}/correct",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
            "cash_kurus": 150_000,
            "card_kurus": 350_000,
            "summary_date": "2026-06-23",
        },
    )
    assert response.status_code == 422
    assert "already exists" in response.json()["detail"].lower()

    still_posted = client.get(
        f"/entities/{entity_id}/pos/daily-summaries/{second_id}"
    )
    assert still_posted.json()["status"] == "posted"


def test_correct_period_lock_requires_unlock(
    auth_enforced,
    client,
    db_session,
    pos_correct_setup,
) -> None:
    from app.core.auth.types import EntityRole
    from app.core.period_locks.models import PeriodLockKind
    from app.core.period_locks.service import close_period
    from app.features.auth import service as auth_service
    from app.features.auth.schema import MembershipCreate, UserCreate
    from app.features.entities.models import EntitySetting

    entity_id = pos_correct_setup["entity_id"]
    drawer = pos_correct_setup["drawer"]

    owner = auth_service.create_user(
        db_session, UserCreate(email="pos-correct-owner@example.com", display_name="Owner")
    )
    auth_service.add_entity_member(
        db_session,
        entity_id,
        MembershipCreate(user_id=owner.id, role=EntityRole.OWNER),
    )

    with entity_context(db_session, entity_id):
        db_session.add(
            EntitySetting(key="go_live_date", value=date(2026, 1, 1).isoformat())
        )
        db_session.commit()

    owner_headers = auth_headers(owner)
    posted = _post_sample_summary(client, pos_correct_setup, headers=owner_headers)
    locked_day = date(2026, 6, 22)

    close_period(
        db_session,
        entity_id,
        lock_kind=PeriodLockKind.DAY,
        anchor_date=locked_day,
        actor_id=owner.id,
    )

    blocked = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{posted['id']}/correct",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(owner.id),
            "cash_kurus": 160_000,
            "card_kurus": 340_000,
            "summary_date": "2026-06-22",
        },
        headers=auth_headers(owner),
    )
    assert blocked.status_code == 422
    assert "closed period" in blocked.json()["detail"].lower()

    allowed = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{posted['id']}/correct",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(owner.id),
            "cash_kurus": 160_000,
            "card_kurus": 340_000,
            "summary_date": "2026-06-22",
            "period_unlock_reason": "Correcting posted daily sales in closed day",
        },
        headers=auth_headers(owner),
    )
    assert allowed.status_code == 200
    assert allowed.json()["confirmed_cash_kurus"] == 160_000


@pytest.fixture
def auth_enforced(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", True)
    yield
    monkeypatch.setattr(settings, "auth_enforcement", False)
