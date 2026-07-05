"""Owner-created expense categories — band 5900–5999, entity-scoped."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntryLine
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.chart_of_accounts.service import create_custom_expense_account

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def chart_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    return {"entity_id": restaurant_a.id, "drawer": drawer}


def _post_category(client: TestClient, entity_id: uuid.UUID, name: str):
    return client.post(
        f"/entities/{entity_id}/chart-of-accounts",
        json={"name": name},
    )


def test_create_custom_expense_category(
    client: TestClient, chart_setup, db_session
) -> None:
    entity_id = chart_setup["entity_id"]
    response = _post_category(client, entity_id, "Office supplies")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["code"] == "5900"
    assert body["name_en"] == "Office supplies"
    assert body["name_tr"] == "Office supplies"
    assert body["account_type"] == "expense"
    assert body["normal_balance"] == "debit"
    assert body["accepts_opening_balance"] is False

    listing = client.get(f"/entities/{entity_id}/chart-of-accounts?limit=200")
    assert listing.status_code == 200
    match = next(
        (row for row in listing.json()["items"] if row["id"] == body["id"]),
        None,
    )
    assert match is not None
    assert match["account_type"] == "expense"
    assert match["code"] == "5900"


def test_second_custom_category_gets_next_code(
    client: TestClient, chart_setup
) -> None:
    entity_id = chart_setup["entity_id"]
    first = _post_category(client, entity_id, "Cat A")
    second = _post_category(client, entity_id, "Cat B")
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["code"] == "5900"
    assert second.json()["code"] == "5901"


def test_duplicate_name_case_insensitive(client: TestClient, chart_setup) -> None:
    entity_id = chart_setup["entity_id"]
    assert _post_category(client, entity_id, "Owner misc bucket").status_code == 201
    dup = _post_category(client, entity_id, "owner misc bucket")
    assert dup.status_code == 409
    assert "already exists" in dup.json()["detail"]


def test_empty_name_rejected(client: TestClient, chart_setup) -> None:
    entity_id = chart_setup["entity_id"]
    response = _post_category(client, entity_id, "   ")
    assert response.status_code == 422


def test_rejects_extra_fields(client: TestClient, chart_setup) -> None:
    entity_id = chart_setup["entity_id"]
    response = client.post(
        f"/entities/{entity_id}/chart-of-accounts",
        json={"name": "Valid", "account_type": "asset"},
    )
    assert response.status_code == 422


def test_custom_category_limit(client: TestClient, db_session, chart_setup) -> None:
    entity_id = chart_setup["entity_id"]
    with entity_context(db_session, entity_id):
        for code in range(5900, 6000):
            db_session.add(
                Account(
                    entity_id=entity_id,
                    code=str(code),
                    name_en=f"Reserved {code}",
                    name_tr=f"Reserved {code}",
                    account_type=AccountType.EXPENSE,
                    normal_balance=AccountNormalBalance.DEBIT,
                    accepts_opening_balance=False,
                    is_active=True,
                )
            )
        db_session.commit()

    response = _post_category(client, entity_id, "One too many")
    assert response.status_code == 409
    assert "limit" in response.json()["detail"].lower()


def test_custom_category_rls_isolated(
    client: TestClient, db_session, restaurant_a, restaurant_b
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    seed_default_chart(db_session, restaurant_b.id)

    created = _post_category(client, restaurant_a.id, "Entity A only")
    assert created.status_code == 201
    created_id = created.json()["id"]

    listing_b = client.get(
        f"/entities/{restaurant_b.id}/chart-of-accounts?limit=200"
    )
    assert listing_b.status_code == 200
    assert all(row["id"] != created_id for row in listing_b.json()["items"])

    with entity_context(db_session, restaurant_b.id):
        foreign = db_session.scalar(
            select(Account).where(Account.id == uuid.UUID(created_id))
        )
        assert foreign is None


def test_expense_posts_dr_custom_category_cr_cash(
    client: TestClient, chart_setup, db_session
) -> None:
    entity_id = chart_setup["entity_id"]
    drawer = chart_setup["drawer"]

    created = _post_category(client, entity_id, "Petty misc")
    assert created.status_code == 201
    expense_id = created.json()["id"]
    expense_code = created.json()["code"]

    expense = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": "2026-06-01",
            "amount_kurus": 12_500,
            "expense_account_id": expense_id,
            "money_account_id": str(drawer.id),
            "written_item_description": "misc",
            "has_source_document": False,
            "description": "Petty cash",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert expense.status_code == 201, expense.text
    journal_id = uuid.UUID(expense.json()["journal_entry_id"])

    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(Account.code, JournalEntryLine.side)
            .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
            .where(JournalEntryLine.journal_entry_id == journal_id)
        ).all()
    assert (expense_code, AccountNormalBalance.DEBIT) in set(rows)
    assert any(side == AccountNormalBalance.CREDIT for _, side in rows)


def test_service_empty_name_raises(db_session, restaurant_a) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    with pytest.raises(ValueError, match="required"):
        create_custom_expense_account(db_session, restaurant_a.id, "  ")
