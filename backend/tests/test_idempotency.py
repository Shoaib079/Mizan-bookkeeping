"""Idempotency on mutation endpoints — Phase 8.5 Slice 1."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.config import settings
from app.core.auth.types import EntityRole
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.idempotency.models import IdempotencyRecord
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.expenses.models import ExpenseEntry
from tests.auth_helpers import auth_headers
from tests.test_roles_permissions import _add_member, _create_user, auth_enforced

RENT_EXPENSE_CODE = "5000"
ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def idempotency_setup(db_session, restaurant_a):
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


def _expense_payload(setup: dict) -> dict:
    return {
        "expense_date": "2026-06-01",
        "amount_kurus": 50_000,
        "expense_account_id": str(setup["accounts"][RENT_EXPENSE_CODE]),
        "money_account_id": str(setup["bank"].id),
        "written_item_description": "peynir",
        "has_source_document": False,
        "description": "Market alışverişi",
        "actor_id": str(ACTOR_ID),
    }


def _expense_count(db_session, entity_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        return db_session.scalar(select(func.count()).select_from(ExpenseEntry)) or 0


def test_repeated_key_returns_original_response_no_second_record(
    db_session,
    client: TestClient,
    idempotency_setup,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = idempotency_setup["entity_id"]
    key = str(uuid.uuid4())
    url = f"/entities/{entity_id}/expenses"
    payload = _expense_payload(idempotency_setup)
    headers = {"Idempotency-Key": key}

    first = client.post(url, json=payload, headers=headers)
    second = client.post(url, json=payload, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json() == second.json()
    assert _expense_count(db_session, entity_id) == 1

    records = db_session.scalars(select(IdempotencyRecord)).all()
    assert len(records) == 1
    assert records[0].status_code == 201
    assert records[0].idempotency_key == key


def test_different_keys_same_payload_both_succeed(
    db_session,
    client: TestClient,
    idempotency_setup,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = idempotency_setup["entity_id"]
    url = f"/entities/{entity_id}/expenses"
    payload = _expense_payload(idempotency_setup)

    first = client.post(
        url,
        json=payload,
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )
    second = client.post(
        url,
        json=payload,
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert _expense_count(db_session, entity_id) == 2


def test_enforcement_requires_header_on_mutations(
    client: TestClient,
    idempotency_setup,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = idempotency_setup["entity_id"]
    response = client.post(
        f"/entities/{entity_id}/expenses",
        json=_expense_payload(idempotency_setup),
    )
    assert response.status_code == 400
    assert "Idempotency-Key" in response.json()["detail"]


def test_invalid_key_rejected(
    client: TestClient,
    idempotency_setup,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = idempotency_setup["entity_id"]
    response = client.post(
        f"/entities/{entity_id}/expenses",
        json=_expense_payload(idempotency_setup),
        headers={"Idempotency-Key": "not-a-uuid"},
    )
    assert response.status_code == 400
    assert "UUID" in response.json()["detail"]


def test_get_routes_skip_idempotency(
    client: TestClient,
    idempotency_setup,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = idempotency_setup["entity_id"]
    response = client.get(f"/entities/{entity_id}/expense-items")
    assert response.status_code == 200


def test_health_skips_idempotency(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    response = client.get("/health")
    assert response.status_code == 200


def test_health_ready_skips_idempotency(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    response = client.get("/health/ready")
    assert response.status_code == 200


def test_statement_preview_skips_idempotency(
    client: TestClient,
    idempotency_setup,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = idempotency_setup["entity_id"]
    bank = idempotency_setup["bank"]
    csv = b"Tarih,Aciklama,Borc,Alacak\n01.02.2026,Test,100,00,\n"
    response = client.post(
        f"/entities/{entity_id}/banking/accounts/{bank.id}/statements/preview",
        files={"file": ("tr.csv", csv, "text/csv")},
    )
    assert response.status_code == 200
    assert response.json()["rows"]


def test_detect_document_type_skips_idempotency(
    client: TestClient,
    idempotency_setup,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = idempotency_setup["entity_id"]
    xml = b'<?xml version="1.0"?><Invoice></Invoice>'
    response = client.post(
        f"/entities/{entity_id}/detect-document-type",
        files={"file": ("invoice.xml", xml, "application/xml")},
    )
    assert response.status_code == 200
    assert "document_type" in response.json()


def test_should_skip_idempotency_for_detect_document_type() -> None:
    from app.core.idempotency.service import should_skip_idempotency

    path = f"/entities/{uuid.uuid4()}/detect-document-type"
    assert should_skip_idempotency("POST", path) is True
    assert should_skip_idempotency("GET", path) is True


def test_optional_key_dedup_when_enforcement_off(
    db_session,
    client: TestClient,
    idempotency_setup,
) -> None:
    assert settings.idempotency_enforcement is False
    entity_id = idempotency_setup["entity_id"]
    key = str(uuid.uuid4())
    url = f"/entities/{entity_id}/expenses"
    payload = _expense_payload(idempotency_setup)
    headers = {"Idempotency-Key": key}

    first = client.post(url, json=payload, headers=headers)
    second = client.post(url, json=payload, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert _expense_count(db_session, entity_id) == 1


def test_auth_scopes_idempotency_per_user(
    auth_enforced,
    db_session,
    client: TestClient,
    idempotency_setup,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = idempotency_setup["entity_id"]
    owner = _create_user(db_session, "owner-idem@example.com")
    partner = _create_user(db_session, "partner-idem@example.com")
    _add_member(db_session, entity_id, owner.id, role=EntityRole.OWNER)
    _add_member(db_session, entity_id, partner.id, role=EntityRole.PARTNER)

    key = str(uuid.uuid4())
    url = f"/entities/{entity_id}/expenses"
    payload = _expense_payload(idempotency_setup)

    owner_resp = client.post(
        url,
        json=payload,
        headers={**auth_headers(owner), "Idempotency-Key": key},
    )
    partner_resp = client.post(
        url,
        json=payload,
        headers={**auth_headers(partner), "Idempotency-Key": key},
    )

    assert owner_resp.status_code == 201
    assert partner_resp.status_code == 201
    assert owner_resp.json()["id"] != partner_resp.json()["id"]
    assert _expense_count(db_session, entity_id) == 2

    scoped = db_session.scalars(
        select(IdempotencyRecord).order_by(IdempotencyRecord.created_at)
    ).all()
    assert len(scoped) == 2
    assert scoped[0].scope_user_id != scoped[1].scope_user_id


def test_same_user_repeated_key_collapses(
    auth_enforced,
    db_session,
    client: TestClient,
    idempotency_setup,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = idempotency_setup["entity_id"]
    owner = _create_user(db_session, "owner-repeat@example.com")
    _add_member(db_session, entity_id, owner.id, role=EntityRole.OWNER)

    key = str(uuid.uuid4())
    url = f"/entities/{entity_id}/expenses"
    payload = _expense_payload(idempotency_setup)
    headers = {**auth_headers(owner), "Idempotency-Key": key}

    first = client.post(url, json=payload, headers=headers)
    second = client.post(url, json=payload, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json() == second.json()
    assert _expense_count(db_session, entity_id) == 1


def test_client_retry_contract_reuses_one_key_not_two(
    db_session,
    client: TestClient,
    idempotency_setup,
    monkeypatch,
) -> None:
    """Slice 11.19 client contract: double-click / network retry must reuse one key.

    The frontend must call beginSubmit() once per submit intent and pass the same
    Idempotency-Key on retry. A fresh key per fetch (the old api.ts bug) would
    create two records — this test locks the server-side expectation the UI must meet.
    """
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = idempotency_setup["entity_id"]
    stable_key = str(uuid.uuid4())
    url = f"/entities/{entity_id}/expenses"
    payload = _expense_payload(idempotency_setup)
    headers = {"Idempotency-Key": stable_key}

    retry_one = client.post(url, json=payload, headers=headers)
    retry_two = client.post(url, json=payload, headers=headers)
    fresh_key = client.post(
        url,
        json=payload,
        headers={"Idempotency-Key": str(uuid.uuid4())},
    )

    assert retry_one.status_code == 201
    assert retry_two.status_code == 201
    assert retry_one.json() == retry_two.json()
    assert _expense_count(db_session, entity_id) == 2
    assert fresh_key.status_code == 201
    assert fresh_key.json()["id"] != retry_one.json()["id"]
