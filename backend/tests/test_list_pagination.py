"""Pagination, search, and filters on list endpoints (Phase 8.5 Slice 3)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.expenses.normalize import normalize_expense_item_text
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.entities.models import Entity
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate


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
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "accounts": accounts,
    }


def _create_supplier(
    db_session: Session, entity_id: uuid.UUID, name: str, vkn: str
) -> None:
    supplier_service.create_supplier(
        db_session,
        entity_id,
        SupplierCreate(name=name, vkn=vkn),
    )


def test_supplier_q_narrows_turkish_case(
    client: TestClient, db_session: Session, restaurant_a: Entity
) -> None:
    _create_supplier(db_session, restaurant_a.id, "PEYNİR TOPTAN", "1111111111")
    _create_supplier(db_session, restaurant_a.id, "Un Fabrikası", "2222222222")

    norm = normalize_expense_item_text("peynir")
    response = client.get(
        f"/entities/{restaurant_a.id}/suppliers",
        params={"q": "peynir"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert "peyn" in body["items"][0]["name"].lower() or norm in normalize_expense_item_text(
        body["items"][0]["name"]
    )


def test_supplier_vkn_filter_via_q(
    client: TestClient, db_session: Session, restaurant_a: Entity
) -> None:
    _create_supplier(db_session, restaurant_a.id, "Alpha", "3333333333")
    _create_supplier(db_session, restaurant_a.id, "Beta", "4444444444")

    response = client.get(
        f"/entities/{restaurant_a.id}/suppliers",
        params={"q": "3333"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["vkn"] == "3333333333"


def test_supplier_pagination_slices_and_total(
    client: TestClient, db_session: Session, restaurant_a: Entity
) -> None:
    for i in range(5):
        _create_supplier(
            db_session,
            restaurant_a.id,
            f"Supplier {i}",
            f"{1000000000 + i}",
        )

    page1 = client.get(
        f"/entities/{restaurant_a.id}/suppliers",
        params={"limit": 2, "offset": 0},
    )
    page2 = client.get(
        f"/entities/{restaurant_a.id}/suppliers",
        params={"limit": 2, "offset": 2},
    )
    assert page1.status_code == 200
    assert page2.status_code == 200
    assert page1.json()["total"] == 5
    assert len(page1.json()["items"]) == 2
    assert len(page2.json()["items"]) == 2
    assert page1.json()["limit"] == 2
    assert page1.json()["offset"] == 0
    ids_page1 = {row["id"] for row in page1.json()["items"]}
    ids_page2 = {row["id"] for row in page2.json()["items"]}
    assert ids_page1.isdisjoint(ids_page2)


def test_supplier_cross_entity_isolation(
    client: TestClient,
    db_session: Session,
    restaurant_a: Entity,
    restaurant_b: Entity,
) -> None:
    _create_supplier(db_session, restaurant_a.id, "Only A", "5555555555")

    list_b = client.get(f"/entities/{restaurant_b.id}/suppliers")
    assert list_b.status_code == 200
    assert list_b.json()["total"] == 0
    assert list_b.json()["items"] == []


def test_ledger_entries_q_and_status_filter(
    client: TestClient, db_session: Session, restaurant_a: Entity
) -> None:
    from app.core.chart_of_accounts.seed import seed_default_chart
    from app.core.chart_of_accounts.types import AccountNormalBalance

    seed_default_chart(db_session, restaurant_a.id)
    accounts = client.get(f"/entities/{restaurant_a.id}/chart-of-accounts").json()["items"]
    cash = next(a for a in accounts if a["code"] == "1000")
    equity = next(a for a in accounts if a["code"] == "5000")
    actor = uuid.uuid4()

    create = client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json={
            "entry_date": "2026-01-15",
            "description": "PEYNİR düzeltme kaydı",
            "actor_id": str(actor),
            "lines": [
                {
                    "account_id": cash["id"],
                    "amount_kurus": 10000,
                    "side": AccountNormalBalance.DEBIT.value,
                },
                {
                    "account_id": equity["id"],
                    "amount_kurus": 10000,
                    "side": AccountNormalBalance.CREDIT.value,
                },
            ],
        },
    )
    assert create.status_code == 201

    listed = client.get(
        f"/entities/{restaurant_a.id}/ledger/entries",
        params={"q": "peynir", "status": "posted"},
    )
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["total"] >= 1
    assert any("peyn" in e["description"].lower() for e in body["items"])


def test_expenses_date_filter_narrows(
    client: TestClient, expense_setup: dict
) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"]["5000"]
    money_account_id = expense_setup["bank"].id
    actor = uuid.uuid4()

    for expense_date in (date(2026, 1, 10), date(2026, 2, 10)):
        resp = client.post(
            f"/entities/{entity_id}/expenses",
            json={
                "expense_date": expense_date.isoformat(),
                "amount_kurus": 5000,
                "expense_account_id": str(rent_id),
                "money_account_id": str(money_account_id),
                "description": f"Expense {expense_date}",
                "actor_id": str(actor),
            },
        )
        assert resp.status_code == 201

    jan = client.get(
        f"/entities/{entity_id}/expenses",
        params={"from": "2026-01-01", "to": "2026-01-31"},
    )
    assert jan.status_code == 200
    assert jan.json()["total"] == 1
