"""SEC-1 — Regression tests for auth guard coverage on POS + /users routes."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.features.auth import service as auth_service
from app.features.auth.schema import UserCreate
from tests.auth_helpers import auth_headers


@pytest.fixture
def auth_enforced(monkeypatch):
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", True)
    yield


def _create_authed_user(db_session):
    user = auth_service.create_user(
        db_session, UserCreate(email="sec1-owner@example.com", display_name="Owner")
    )
    return user


# --- POS routes: must require membership guard ---


def test_list_pos_settlements_requires_auth(client: TestClient, auth_enforced) -> None:
    entity_id = uuid.uuid4()
    resp = client.get(f"/entities/{entity_id}/pos/settlements")
    assert resp.status_code in (401, 403), f"Expected auth error, got {resp.status_code}"


def test_get_pos_settlement_requires_auth(client: TestClient, auth_enforced) -> None:
    entity_id = uuid.uuid4()
    settlement_id = uuid.uuid4()
    resp = client.get(f"/entities/{entity_id}/pos/settlements/{settlement_id}")
    assert resp.status_code in (401, 403), f"Expected auth error, got {resp.status_code}"


def test_list_card_sales_requires_auth(client: TestClient, auth_enforced) -> None:
    entity_id = uuid.uuid4()
    resp = client.get(f"/entities/{entity_id}/pos/card-sales")
    assert resp.status_code in (401, 403), f"Expected auth error, got {resp.status_code}"


def test_clearing_reconciliation_requires_auth(client: TestClient, auth_enforced) -> None:
    entity_id = uuid.uuid4()
    resp = client.get(f"/entities/{entity_id}/pos/clearing-reconciliation")
    assert resp.status_code in (401, 403), f"Expected auth error, got {resp.status_code}"


def test_get_daily_summary_requires_auth(client: TestClient, auth_enforced) -> None:
    entity_id = uuid.uuid4()
    summary_id = uuid.uuid4()
    resp = client.get(f"/entities/{entity_id}/pos/daily-summaries/{summary_id}")
    assert resp.status_code in (401, 403), f"Expected auth error, got {resp.status_code}"


# --- /users routes: must require auth when enforced ---


def test_post_users_requires_auth(client: TestClient, auth_enforced) -> None:
    resp = client.post("/users", json={"email": "anon@example.com"})
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"


def test_get_user_by_id_requires_auth(client: TestClient, auth_enforced) -> None:
    resp = client.get(f"/users/{uuid.uuid4()}")
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"


def test_post_users_works_with_auth(client: TestClient, db_session, auth_enforced) -> None:
    user = _create_authed_user(db_session)
    resp = client.post(
        "/users",
        json={"email": "new-user-via-api@example.com", "display_name": "New User"},
        headers=auth_headers(user),
    )
    assert resp.status_code == 201


def test_get_user_by_id_works_with_auth(client: TestClient, db_session, auth_enforced) -> None:
    user = _create_authed_user(db_session)
    resp = client.get(f"/users/{user.id}", headers=auth_headers(user))
    assert resp.status_code == 200
    assert resp.json()["email"] == "sec1-owner@example.com"
