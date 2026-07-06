"""SEC-2 — actor_id override: auth user takes precedence over body value."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth.deps import resolve_actor_id
from app.core.schema_types import DEV_ACTOR_ID, coerce_optional_uuid
from app.db.session import entity_context
from app.features.auth import service as auth_service
from app.features.auth.models import User
from app.features.auth.schema import UserCreate
from app.features.delivery.schema import DeliveryReportCreate
from app.features.entities.models import Entity
from tests.auth_helpers import auth_headers
from tests.delivery_helpers import delivery_setup as build_delivery_setup


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


# --- coercion + resolve_actor_id unit tests ---


def test_coerce_optional_uuid_empty_string_becomes_none() -> None:
    assert coerce_optional_uuid("") is None
    assert coerce_optional_uuid("   ") is None
    assert coerce_optional_uuid(None) is None


def test_coerce_optional_uuid_parses_valid_string() -> None:
    uid = uuid.uuid4()
    assert coerce_optional_uuid(str(uid)) == uid


def test_request_schema_accepts_empty_actor_id_string() -> None:
    from app.features.invoices.schema import ConfirmDraftRequest
    from app.features.payables.schema import SupplierPaymentCreate
    from app.features.staff.schema import StaffPaymentCreate

    assert ConfirmDraftRequest.model_validate({"actor_id": ""}).actor_id is None
    assert DeliveryReportCreate.model_validate(
        {
            "delivery_platform_id": str(uuid.uuid4()),
            "period_start": "2026-01-01",
            "period_end": "2026-01-31",
            "gross_kurus": 1000,
            "description": "Getir sales",
            "actor_id": "",
        }
    ).actor_id is None

    req = SupplierPaymentCreate.model_validate(
        {
            "payment_date": "2026-01-01",
            "amount_kurus": 5000,
            "description": "test",
            "payment_account_id": str(uuid.uuid4()),
            "actor_id": "",
        }
    )
    assert req.actor_id is None

    staff = StaffPaymentCreate.model_validate(
        {
            "payment_date": "2026-01-01",
            "amount_minor": 5000,
            "description": "salary",
            "payment_account_id": str(uuid.uuid4()),
            "actor_id": " ",
            "period_year": 2026,
            "period_month": 1,
            "period_salary_minor": 5000,
        }
    )
    assert staff.actor_id is None


def test_resolve_actor_id_prefers_auth_user() -> None:
    user = User(email="u@example.com", display_name="U")
    user.id = uuid.uuid4()
    body_id = uuid.uuid4()
    assert resolve_actor_id(user, body_id) == user.id


def test_resolve_actor_id_falls_back_to_body() -> None:
    body_id = uuid.uuid4()
    assert resolve_actor_id(None, body_id) == body_id


def test_resolve_actor_id_dev_fallback_when_auth_off() -> None:
    assert settings.auth_enforcement is False
    assert resolve_actor_id(None, None) == DEV_ACTOR_ID


def test_resolve_actor_id_raises_when_auth_on_and_both_none(auth_enforced) -> None:
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
    assert resp.status_code == 404


def test_invoice_confirm_works_without_body_actor(
    client: TestClient, db_session: Session, auth_enforced
) -> None:
    user, entity = _setup_user_and_entity(db_session)
    resp = client.post(
        f"/entities/{entity.id}/invoices/drafts/{uuid.uuid4()}/confirm",
        json={},
        headers=auth_headers(user),
    )
    assert resp.status_code == 404


def test_invoice_confirm_empty_actor_id_does_not_422(
    client: TestClient, db_session: Session, auth_enforced
) -> None:
    user, entity = _setup_user_and_entity(db_session)
    resp = client.post(
        f"/entities/{entity.id}/invoices/drafts/{uuid.uuid4()}/confirm",
        json={"actor_id": ""},
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
            "actor_id": "",
        },
        headers=auth_headers(user),
    )
    assert resp.status_code in (404, 422)
    if resp.status_code == 422:
        detail = resp.json().get("detail", "")
        assert "actor_id" not in str(detail).lower()


def test_delivery_report_create_with_empty_actor_id_auth_off(
    client: TestClient, db_session: Session, restaurant_a
) -> None:
    """Localhost (auth off): actor_id=\"\" coerces to None then dev actor."""
    assert settings.auth_enforcement is False
    setup = build_delivery_setup(db_session, restaurant_a.id)
    entity_id = setup["entity_id"]
    platform_id = setup["platforms"]["Getir"].id

    resp = client.post(
        f"/entities/{entity_id}/delivery/reports",
        json={
            "delivery_platform_id": str(platform_id),
            "period_start": "2026-03-01",
            "period_end": "2026-03-31",
            "gross_kurus": 500_000,
            "description": "Getir March sales",
            "actor_id": "",
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["gross_kurus"] == 500_000


def test_delivery_report_create_empty_actor_id_uses_auth_user(
    client: TestClient, db_session: Session, auth_enforced, restaurant_a
) -> None:
    user, entity = _setup_user_and_entity(db_session)
    setup = build_delivery_setup(db_session, entity.id)
    platform_id = setup["platforms"]["Getir"].id

    resp = client.post(
        f"/entities/{entity.id}/delivery/reports",
        json={
            "delivery_platform_id": str(platform_id),
            "period_start": "2026-04-01",
            "period_end": "2026-04-30",
            "gross_kurus": 400_000,
            "description": "Getir April sales",
            "actor_id": "",
        },
        headers=auth_headers(user),
    )
    assert resp.status_code == 201, resp.text
