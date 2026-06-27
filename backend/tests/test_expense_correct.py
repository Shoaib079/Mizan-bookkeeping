"""Correct posted expenses — void GL and repost (Phase 11 Slice 11.10)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import GENERAL_EXPENSE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntryStatus
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus
from tests.auth_helpers import auth_headers

RENT_EXPENSE_CODE = "5000"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def expense_correct_setup(db_session, restaurant_a):
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
        "drawer": drawer,
        "accounts": accounts,
    }


def _post_manual_expense(
    client,
    setup,
    *,
    expense_date: str = "2026-06-10",
    headers: dict | None = None,
) -> dict:
    entity_id = setup["entity_id"]
    rent_id = setup["accounts"][RENT_EXPENSE_CODE]
    response = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": expense_date,
            "amount_kurus": 50_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(setup["drawer"].id),
            "written_item_description": "peynir",
            "has_source_document": False,
            "description": "Market alışverişi",
            "actor_id": str(ACTOR_ID),
        },
        headers=headers or {},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "posted"
    return body


def _gl_balance(
    db_session,
    entity_id: uuid.UUID,
    account_id: uuid.UUID,
    normal: AccountNormalBalance,
) -> int:
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


def test_correct_changes_amount_voids_old_reposts_new(
    db_session, client, expense_correct_setup
) -> None:
    entity_id = expense_correct_setup["entity_id"]
    rent_id = expense_correct_setup["accounts"][RENT_EXPENSE_CODE]
    drawer_gl = expense_correct_setup["drawer"].gl_account_id
    posted = _post_manual_expense(client, expense_correct_setup)
    expense_id = posted["id"]
    old_journal_id = uuid.UUID(posted["journal_entry_id"])

    correct = client.post(
        f"/entities/{entity_id}/expenses/{expense_id}/correct",
        json={
            "expense_date": "2026-06-10",
            "amount_kurus": 75_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_correct_setup["drawer"].id),
            "written_item_description": "peynir",
            "has_source_document": False,
            "description": "Corrected market purchase",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert correct.status_code == 200, correct.text
    body = correct.json()
    assert body["expense"]["id"] == expense_id
    assert body["expense"]["amount_kurus"] == 75_000
    assert body["expense"]["journal_entry_id"] != str(old_journal_id)
    assert body["original_journal_entry_id"] == str(old_journal_id)
    assert body["corrected_journal_entry_id"] == body["expense"]["journal_entry_id"]

    with entity_context(db_session, entity_id):
        old_je = db_session.get(JournalEntry, old_journal_id)
        assert old_je is not None
        assert old_je.status == JournalEntryStatus.VOIDED

        entry = db_session.get(ExpenseEntry, uuid.UUID(expense_id))
        assert entry is not None
        assert entry.journal_entry_id == uuid.UUID(body["corrected_journal_entry_id"])
        assert entry.amount_kurus == 75_000

    assert _gl_balance(db_session, entity_id, rent_id, AccountNormalBalance.DEBIT) == 75_000
    assert (
        _gl_balance(db_session, entity_id, drawer_gl, AccountNormalBalance.DEBIT) == -75_000
    )


def test_correct_changes_account_and_date(
    db_session, client, expense_correct_setup
) -> None:
    entity_id = expense_correct_setup["entity_id"]
    rent_id = expense_correct_setup["accounts"][RENT_EXPENSE_CODE]
    general_id = expense_correct_setup["accounts"][GENERAL_EXPENSE_CODE]
    posted = _post_manual_expense(client, expense_correct_setup)
    expense_id = posted["id"]

    correct = client.post(
        f"/entities/{entity_id}/expenses/{expense_id}/correct",
        json={
            "expense_date": "2026-06-11",
            "amount_kurus": 50_000,
            "expense_account_id": str(general_id),
            "money_account_id": str(expense_correct_setup["drawer"].id),
            "written_item_description": "peynir",
            "has_source_document": False,
            "description": "Reclassified utility",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert correct.status_code == 200
    body = correct.json()
    assert body["expense"]["expense_date"] == "2026-06-11"
    assert body["expense"]["expense_account_id"] == str(general_id)

    with entity_context(db_session, entity_id):
        entry = db_session.get(ExpenseEntry, uuid.UUID(expense_id))
        assert entry is not None
        assert entry.expense_date == date(2026, 6, 11)
        assert entry.expense_account_id == general_id

    assert _gl_balance(db_session, entity_id, rent_id, AccountNormalBalance.DEBIT) == 0
    assert (
        _gl_balance(db_session, entity_id, general_id, AccountNormalBalance.DEBIT) == 50_000
    )


def test_correct_non_posted_expense_409(client, expense_correct_setup) -> None:
    entity_id = expense_correct_setup["entity_id"]
    rent_id = expense_correct_setup["accounts"][RENT_EXPENSE_CODE]

    client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": "2026-06-12",
            "amount_kurus": 8_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_correct_setup["drawer"].id),
            "written_item_description": "peynir",
            "has_source_document": False,
            "description": "İlk kayıt",
            "actor_id": str(ACTOR_ID),
        },
    )

    pending = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": "2026-06-12",
            "amount_kurus": 5_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_correct_setup["drawer"].id),
            "written_item_description": "peynr",
            "has_source_document": True,
            "description": "Belirsiz yazım",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert pending.status_code == 201
    expense_id = pending.json()["id"]
    assert pending.json()["status"] == "needs_review"

    response = client.post(
        f"/entities/{entity_id}/expenses/{expense_id}/correct",
        json={
            "expense_date": "2026-06-12",
            "amount_kurus": 5_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_correct_setup["drawer"].id),
            "written_item_description": "peynr",
            "has_source_document": True,
            "description": "Belirsiz yazım",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 409


def test_correct_period_lock_requires_unlock(
    auth_enforced,
    client,
    db_session,
    expense_correct_setup,
) -> None:
    from app.core.auth.types import EntityRole
    from app.core.period_locks.models import PeriodLockKind
    from app.core.period_locks.service import close_period
    from app.features.auth import service as auth_service
    from app.features.auth.schema import MembershipCreate, UserCreate
    from app.features.entities.models import EntitySetting

    entity_id = expense_correct_setup["entity_id"]
    rent_id = expense_correct_setup["accounts"][RENT_EXPENSE_CODE]

    owner = auth_service.create_user(
        db_session, UserCreate(email="expense-correct-owner@example.com", display_name="Owner")
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
    posted = _post_manual_expense(
        client, expense_correct_setup, expense_date="2026-06-10", headers=owner_headers
    )
    expense_id = posted["id"]
    locked_day = date(2026, 6, 10)

    close_period(
        db_session,
        entity_id,
        lock_kind=PeriodLockKind.DAY,
        anchor_date=locked_day,
        actor_id=owner.id,
    )

    blocked = client.post(
        f"/entities/{entity_id}/expenses/{expense_id}/correct",
        json={
            "expense_date": "2026-06-10",
            "amount_kurus": 60_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_correct_setup["drawer"].id),
            "written_item_description": "peynir",
            "has_source_document": False,
            "description": "Corrected in locked period",
            "actor_id": str(owner.id),
        },
        headers=auth_headers(owner),
    )
    assert blocked.status_code == 422
    assert "closed period" in blocked.json()["detail"].lower()

    allowed = client.post(
        f"/entities/{entity_id}/expenses/{expense_id}/correct",
        json={
            "expense_date": "2026-06-10",
            "amount_kurus": 60_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_correct_setup["drawer"].id),
            "written_item_description": "peynir",
            "has_source_document": False,
            "description": "Corrected in locked period",
            "actor_id": str(owner.id),
            "period_unlock_reason": "Correcting posted expense in closed day",
        },
        headers=owner_headers,
    )
    assert allowed.status_code == 200
    assert allowed.json()["expense"]["amount_kurus"] == 60_000


@pytest.fixture
def auth_enforced(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", True)
    yield
    monkeypatch.setattr(settings, "auth_enforcement", False)
