"""Expense account suggestion — learned mappings + AI fallback (post-launch P2)."""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.expenses.account_learning import ExpenseAccountSuggestion
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.expenses.models import ExpenseEntry, ExpenseItem, ExpenseItemAlias

RENT_EXPENSE_CODE = "5000"
ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def expense_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        from app.core.chart_of_accounts.models import Account

        accounts = {a.code: a.id for a in db_session.scalars(select(Account)).all()}
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "drawer": drawer,
        "accounts": accounts,
    }


def _expense_payload(expense_setup, *, item: str, account_id: str) -> dict:
    return {
        "expense_date": "2026-01-15",
        "amount_kurus": 10_000,
        "expense_account_id": account_id,
        "money_account_id": str(expense_setup["drawer"].id),
        "written_item_description": item,
        "description": f"Manual expense — {item}",
        "actor_id": str(ACTOR_ID),
    }


def test_suggest_learned_after_expense_create(
    db_session, client: TestClient, expense_setup
) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    create = client.post(
        f"/entities/{entity_id}/expenses",
        json=_expense_payload(expense_setup, item="kira", account_id=str(rent_id)),
    )
    assert create.status_code == 201

    suggest = client.get(
        f"/entities/{entity_id}/expenses/suggest-account",
        params={"description": "kira"},
    )
    assert suggest.status_code == 200
    body = suggest.json()
    assert body["account_id"] == str(rent_id)
    assert body["source"] == "learned"
    assert body["confidence"] == "high"


def test_variant_spellings_share_one_learned_account(
    db_session, client: TestClient, expense_setup
) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    client.post(
        f"/entities/{entity_id}/expenses",
        json=_expense_payload(expense_setup, item="peynir", account_id=str(rent_id)),
    )
    client.post(
        f"/entities/{entity_id}/expenses",
        json=_expense_payload(expense_setup, item="paneer", account_id=str(rent_id)),
    )

    with entity_context(db_session, entity_id):
        aliases = db_session.scalars(select(ExpenseItemAlias)).all()
        item_ids = {alias.expense_item_id for alias in aliases}
        assert len(item_ids) == 1

    suggest = client.get(
        f"/entities/{entity_id}/expenses/suggest-account",
        params={"description": "paneer"},
    )
    assert suggest.json()["account_id"] == str(rent_id)
    assert suggest.json()["source"] == "learned"


@patch("app.features.expenses.service.suggest_expense_account_via_ai")
def test_ai_fallback_when_not_learned(
    mock_ai,
    client: TestClient,
    expense_setup,
) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]
    mock_ai.return_value = ExpenseAccountSuggestion(
        account_id=rent_id,
        source="ai",
        confidence="medium",
    )

    suggest = client.get(
        f"/entities/{entity_id}/expenses/suggest-account",
        params={"description": "repair machinery"},
    )
    assert suggest.status_code == 200
    body = suggest.json()
    assert body["account_id"] == str(rent_id)
    assert body["source"] == "ai"
    assert body["confidence"] == "medium"
    mock_ai.assert_called_once()


def test_suggest_does_not_create_expense(
    db_session, client: TestClient, expense_setup
) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    client.post(
        f"/entities/{entity_id}/expenses",
        json=_expense_payload(expense_setup, item="kira", account_id=str(rent_id)),
    )

    with entity_context(db_session, entity_id):
        count_before = db_session.scalar(
            select(func.count()).select_from(ExpenseEntry)
        )

    suggest = client.get(
        f"/entities/{entity_id}/expenses/suggest-account",
        params={"description": "kira"},
    )
    assert suggest.status_code == 200

    with entity_context(db_session, entity_id):
        count_after = db_session.scalar(
            select(func.count()).select_from(ExpenseEntry)
        )
        assert count_before == count_after


def test_expense_item_stores_default_account_after_post(
    db_session, client: TestClient, expense_setup
) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    client.post(
        f"/entities/{entity_id}/expenses",
        json=_expense_payload(expense_setup, item="kira", account_id=str(rent_id)),
    )

    with entity_context(db_session, entity_id):
        item = db_session.scalar(select(ExpenseItem))
        assert item is not None
        assert item.default_expense_account_id == rent_id
