"""Entity creation auto-provisions chart + default cash drawer (Phase 12)."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import (
    ADVERTISING_EXPENSE_CODE,
    CLEANING_EXPENSE_CODE,
    DEFAULT_CHART,
    GENERAL_EXPENSE_CODE,
    OFFICE_EXPENSE_CODE,
    REPAIRS_EXPENSE_CODE,
    SUPPLIES_EXPENSE_CODE,
    TRANSPORT_EXPENSE_CODE,
    UTILITIES_EXPENSE_CODE,
)
from app.features.banking.models import MoneyAccountKind
from app.features.entities.models import Entity


def test_create_entity_auto_seeds_chart_and_cash_drawer(
    client: TestClient,
    db_session,
) -> None:
    response = client.post("/entities", json={"name": "Auto Seed Cafe"})
    assert response.status_code == 201
    entity_id = uuid.UUID(response.json()["id"])

    chart = client.get(f"/entities/{entity_id}/chart-of-accounts?limit=200")
    assert chart.status_code == 200
    assert chart.json()["total"] == len(DEFAULT_CHART) + 1

    codes = {row["code"] for row in chart.json()["items"]}
    for code in (
        GENERAL_EXPENSE_CODE,
        UTILITIES_EXPENSE_CODE,
        SUPPLIES_EXPENSE_CODE,
        REPAIRS_EXPENSE_CODE,
        ADVERTISING_EXPENSE_CODE,
        TRANSPORT_EXPENSE_CODE,
        CLEANING_EXPENSE_CODE,
        OFFICE_EXPENSE_CODE,
    ):
        assert code in codes
    assert "5700" not in codes

    money = client.get(f"/entities/{entity_id}/banking/accounts")
    assert money.status_code == 200
    cash = [
        row for row in money.json()["items"] if row["account_kind"] == MoneyAccountKind.CASH.value
    ]
    assert len(cash) == 1

    again = client.post(f"/entities/{entity_id}/chart-of-accounts/seed")
    assert again.status_code == 409


def test_create_entity_opening_balances_work_immediately(client: TestClient) -> None:
    create = client.post("/entities", json={"name": "OB Ready Cafe"})
    assert create.status_code == 201
    entity_id = create.json()["id"]

    money = client.get(f"/entities/{entity_id}/banking/accounts")
    cash_id = next(
        row["id"] for row in money.json()["items"] if row["account_kind"] == MoneyAccountKind.CASH.value
    )

    validate = client.post(
        f"/onboarding/entities/{entity_id}/opening-balances/validate",
        json={
            "lines": [
                {"money_account_id": cash_id, "amount_kurus": 50_000},
                {"account_code": "2000", "amount_kurus": 20_000, "side": "credit"},
            ]
        },
    )
    assert validate.status_code == 200
    body = validate.json()
    assert body["valid"] is True
    assert len(body["journal_lines"]) == 3


def test_create_entity_provision_is_atomic_on_chart_failure(
    db_session,
    monkeypatch,
) -> None:
    from app.features.entities import service as entity_service
    from app.features.entities.schema import EntityCreate

    def boom(*_args, **_kwargs):
        raise RuntimeError("seed failed")

    monkeypatch.setattr(
        "app.features.chart_of_accounts.service.seed_default_chart",
        boom,
    )

    with pytest.raises(RuntimeError, match="seed failed"):
        entity_service.create_entity(db_session, EntityCreate(name="Rollback Test"))

    orphan = db_session.scalar(
        select(Entity).where(Entity.name == "Rollback Test")
    )
    assert orphan is None
