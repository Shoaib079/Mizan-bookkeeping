"""SEC-2 — actor_id override: auth user takes precedence over body value."""

from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth.deps import resolve_actor_id
from app.db.session import entity_context
from app.features.auth import service as auth_service
from app.features.auth.models import User
from app.features.auth.schema import UserCreate
from app.features.entities.models import Entity
from tests.auth_helpers import auth_headers


@pytest.fixture
def auth_enforced(monkeypatch):
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", True)
    yield


def _setup_user_and_entity(db_session: Session) -> tuple[User, Entity]:
    user = auth_service.create_user(
        db_session,
        UserCreate(email="sec2-actor@example.com", display_name="Actor Test"),
    )
    entity = Entity(name="SEC2 Corp", vkn="1234567890")
    db_session.add(entity)
    db_session.flush()
    from app.features.auth.models import EntityMembership

    with entity_context(db_session, entity.id):
        membership = EntityMembership(
            entity_id=entity.id,
            user_id=user.id,
            role="owner",
        )
        db_session.add(membership)
        db_session.commit()
    db_session.refresh(user)
    db_session.refresh(entity)
    return user, entity


# --- resolve_actor_id unit tests ---


def test_resolve_actor_id_prefers_auth_user() -> None:
    user = User(email="u@example.com", display_name="U")
    user.id = uuid.uuid4()
    body_id = uuid.uuid4()
    assert resolve_actor_id(user, body_id) == user.id


def test_resolve_actor_id_falls_back_to_body() -> None:
    body_id = uuid.uuid4()
    assert resolve_actor_id(None, body_id) == body_id


def test_resolve_actor_id_raises_when_both_none() -> None:
    with pytest.raises(HTTPException) as exc_info:
        resolve_actor_id(None, None)
    assert exc_info.value.status_code == 422


# --- Integration: body actor_id ignored under auth enforcement ---


def test_invoice_confirm_uses_auth_actor(
    client: TestClient, db_session: Session, auth_enforced
) -> None:
    """POST /confirm with a bogus body actor_id — backend should use auth user's id."""
    user, entity = _setup_user_and_entity(db_session)
    bogus_actor = uuid.uuid4()
    resp = client.post(
        f"/entities/{entity.id}/invoices/drafts/{uuid.uuid4()}/confirm",
        json={"actor_id": str(bogus_actor)},
        headers=auth_headers(user),
    )
    # 404 is expected (no draft exists), but the key assertion is: it didn't
    # fail with 422 "actor_id required" — the guard resolved the actor.
    assert resp.status_code == 404


def test_invoice_confirm_works_without_body_actor(
    client: TestClient, db_session: Session, auth_enforced
) -> None:
    """POST /confirm with no body actor_id — should still work (auth resolves it)."""
    user, entity = _setup_user_and_entity(db_session)
    resp = client.post(
        f"/entities/{entity.id}/invoices/drafts/{uuid.uuid4()}/confirm",
        json={},
        headers=auth_headers(user),
    )
    assert resp.status_code == 404


def test_cash_movement_uses_auth_actor(
    client: TestClient, db_session: Session, auth_enforced
) -> None:
    user, entity = _setup_user_and_entity(db_session)
    bogus_actor = uuid.uuid4()
    resp = client.post(
        f"/entities/{entity.id}/cash/movements",
        json={
            "money_account_id": str(uuid.uuid4()),
            "movement_date": "2026-01-01",
            "direction": "in",
            "amount_kurus": 1000,
            "offset_account_id": str(uuid.uuid4()),
            "description": "test",
            "actor_id": str(bogus_actor),
        },
        headers=auth_headers(user),
    )
    # 404 expected (money account doesn't exist), but not 422 for actor_id
    assert resp.status_code in (404, 422)
    if resp.status_code == 422:
        detail = resp.json().get("detail", "")
        assert "actor_id" not in str(detail).lower()


def test_supplier_payment_uses_auth_actor(
    client: TestClient, db_session: Session, auth_enforced
) -> None:
    user, entity = _setup_user_and_entity(db_session)
    resp = client.post(
        f"/entities/{entity.id}/suppliers/{uuid.uuid4()}/payments",
        json={
            "payment_date": "2026-01-01",
            "amount_kurus": 5000,
            "description": "test payment",
            "payment_account_id": str(uuid.uuid4()),
        },
        headers=auth_headers(user),
    )
    assert resp.status_code in (404, 422)
    if resp.status_code == 422:
        detail = resp.json().get("detail", "")
        assert "actor_id" not in str(detail).lower()


def test_actor_id_schema_optional() -> None:
    """Request schemas should accept payloads without actor_id."""
    from app.features.invoices.schema import ConfirmDraftRequest
    from app.features.payables.schema import SupplierPaymentCreate

    req = ConfirmDraftRequest()
    assert req.actor_id is None

    req2 = SupplierPaymentCreate(
        payment_date="2026-01-01",
        amount_kurus=5000,
        description="test",
        payment_account_id=uuid.uuid4(),
    )
    assert req2.actor_id is None
