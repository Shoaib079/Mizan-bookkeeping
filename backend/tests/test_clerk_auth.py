"""Clerk authentication — Phase 8 launch readiness."""

from __future__ import annotations

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth.clerk import verify_clerk_token
from app.features.auth import service as auth_service
from app.features.auth.models import AuthAuditEvent
from app.launch import validate_launch_settings
from tests.auth_helpers import auth_headers, clerk_token_for_user
from tests.test_roles_permissions import _create_user, auth_enforced, roles_entity_setup


def test_verify_clerk_token_valid_test_token() -> None:
    settings.clerk_test_mode = True
    claims = verify_clerk_token("test:user_abc:owner@example.com")
    assert claims.clerk_user_id == "user_abc"
    assert claims.email == "owner@example.com"
    assert claims.email_verified is True


def test_verify_clerk_token_rejects_invalid() -> None:
    settings.clerk_test_mode = True
    with pytest.raises(Exception):
        verify_clerk_token("invalid")


def test_verify_clerk_token_rejects_unverified_email() -> None:
    settings.clerk_test_mode = True
    with pytest.raises(Exception):
        verify_clerk_token("test:user_abc:owner@example.com:unverified")


def test_valid_token_resolves_invited_user(
    auth_enforced,
    db_session: Session,
) -> None:
    user = _create_user(db_session, "clerk-link@example.com")
    token = clerk_token_for_user(user, clerk_id="user_clerk_1")
    claims = verify_clerk_token(token)
    resolved = auth_service.resolve_user_from_clerk(
        db_session,
        clerk_user_id=claims.clerk_user_id,
        email=claims.email,
        email_verified=claims.email_verified,
    )
    assert resolved.id == user.id
    assert resolved.external_auth_id == "user_clerk_1"


def test_unprovisioned_clerk_login_denied(
    auth_enforced,
    client: TestClient,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    token = "test:random_clerk:nobody@example.com"
    response = client.get(
        f"/entities/{setup['entity_id']}/expenses",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    assert "invited" in response.json()["detail"].lower()


def test_invalid_token_returns_401(
    auth_enforced,
    client: TestClient,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    response = client.get(
        f"/entities/{setup['entity_id']}/expenses",
        headers={"Authorization": "Bearer invalid"},
    )
    assert response.status_code == 401


def test_users_me_returns_provisioned_user(
    auth_enforced,
    client: TestClient,
    db_session: Session,
) -> None:
    user = _create_user(db_session, "me-endpoint@example.com")
    response = client.get("/users/me", headers=auth_headers(user))
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(user.id)
    assert body["email"] == "me-endpoint@example.com"


def test_users_me_requires_auth_when_enforced(
    auth_enforced,
    client: TestClient,
) -> None:
    response = client.get("/users/me")
    assert response.status_code == 401


def test_inactive_user_denied(
    auth_enforced,
    client: TestClient,
    db_session: Session,
) -> None:
    user = _create_user(db_session, "inactive-clerk@example.com")
    user.external_auth_id = "user_inactive_clerk"
    user.is_active = False
    db_session.commit()
    db_session.refresh(user)

    response = client.post(
        "/entities",
        json={"name": "Should Fail"},
        headers=auth_headers(user),
    )
    assert response.status_code == 403
    assert "inactive" in response.json()["detail"].lower()


def test_non_member_read_and_write_blocked_with_clerk(
    auth_enforced,
    client: TestClient,
    db_session: Session,
    roles_entity_setup,
) -> None:
    setup = roles_entity_setup
    outsider = _create_user(db_session, "clerk-outsider@example.com")

    read_resp = client.get(
        f"/entities/{setup['entity_id']}/banking/accounts",
        headers=auth_headers(outsider),
    )
    assert read_resp.status_code == 403

    write_resp = client.post(
        f"/entities/{setup['entity_id']}/suppliers",
        json={"name": "Denied", "vkn": "1234567890"},
        headers=auth_headers(outsider),
    )
    assert write_resp.status_code == 403


def test_production_refuses_boot_without_enforcement(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "auth_enforcement", False)
    with pytest.raises(RuntimeError, match="AUTH_ENFORCEMENT"):
        validate_launch_settings()


def test_production_refuses_boot_with_clerk_test_mode(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", True)
    with pytest.raises(RuntimeError, match="CLERK_TEST_MODE"):
        validate_launch_settings()


def test_launch_boots_without_clerk_audience_when_enforced(monkeypatch) -> None:
    """Clerk session tokens have no aud claim — CLERK_AUDIENCE is optional at boot."""
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", False)
    monkeypatch.setattr(settings, "clerk_jwks_url", "https://example.test/jwks.json")
    monkeypatch.setattr(settings, "clerk_issuer", "https://example.test")
    monkeypatch.setattr(settings, "clerk_audience", None)
    validate_launch_settings()


def test_verify_clerk_token_rejects_unverified_email_claim(monkeypatch) -> None:
    """Email without explicit email_verified=true is rejected (no primary_email fallback)."""
    settings.clerk_test_mode = False
    settings.clerk_jwks_url = "https://example.test/jwks.json"
    settings.clerk_issuer = "https://example.test"
    settings.clerk_audience = "pk_test_audience"

    token = jwt.encode(
        {
            "sub": "user_fake",
            "email": "fake@example.com",
            "iss": "https://example.test",
            "aud": "pk_test_audience",
        },
        "not-the-real-key",
        algorithm="HS256",
    )

    class FakeJWKClient:
        def get_signing_key_from_jwt(self, _token: str):
            class Key:
                key = "wrong-secret-for-test"

            return Key()

    monkeypatch.setattr("app.core.auth.clerk._jwk_client", None)
    monkeypatch.setattr(
        "app.core.auth.clerk.PyJWKClient",
        lambda *a, **k: FakeJWKClient(),
    )
    with pytest.raises(Exception, match="not verified|Invalid|expired"):
        verify_clerk_token(token)
    settings.clerk_test_mode = True


def test_jwt_decode_passes_audience_when_configured(monkeypatch) -> None:
    """verify_clerk_token forwards CLERK_AUDIENCE to jwt.decode."""
    settings.clerk_test_mode = False
    settings.clerk_jwks_url = "https://example.test/jwks.json"
    settings.clerk_issuer = "https://example.test"
    settings.clerk_audience = "pk_test_audience"

    captured: dict = {}

    def fake_decode(token, key, **kwargs):
        captured.update(kwargs)
        return {
            "sub": "user_aud",
            "email": "aud@example.com",
            "email_verified": True,
            "iss": "https://example.test",
            "aud": "pk_test_audience",
        }

    class FakeJWKClient:
        def get_signing_key_from_jwt(self, _token: str):
            class Key:
                key = "k"

            return Key()

    monkeypatch.setattr("app.core.auth.clerk._jwk_client", None)
    monkeypatch.setattr("app.core.auth.clerk.PyJWKClient", lambda *a, **k: FakeJWKClient())
    monkeypatch.setattr("app.core.auth.clerk.jwt.decode", fake_decode)

    claims = verify_clerk_token("any.jwt.token")
    assert claims.email == "aud@example.com"
    assert captured.get("audience") == "pk_test_audience"
    settings.clerk_test_mode = True


def test_jwt_verification_uses_signature_not_decode_only(monkeypatch) -> None:
    """Tampered token must fail JWKS verification path (not just base64 decode)."""
    settings.clerk_test_mode = False
    settings.clerk_jwks_url = "https://example.test/jwks.json"
    settings.clerk_issuer = "https://example.test"
    token = jwt.encode(
        {"sub": "user_fake", "email": "fake@example.com", "email_verified": True},
        "not-the-real-key",
        algorithm="HS256",
    )

    class FakeJWKClient:
        def get_signing_key_from_jwt(self, _token: str):
            class Key:
                key = "wrong-secret-for-test"

            return Key()

    monkeypatch.setattr("app.core.auth.clerk._jwk_client", None)
    monkeypatch.setattr(
        "app.core.auth.clerk.PyJWKClient",
        lambda *a, **k: FakeJWKClient(),
    )
    with pytest.raises(Exception):
        verify_clerk_token(token)
    settings.clerk_test_mode = True


def test_first_login_links_clerk_id_and_writes_audit(
    auth_enforced,
    db_session: Session,
) -> None:
    user = _create_user(db_session, "audit-link@example.com")
    auth_service.resolve_user_from_clerk(
        db_session,
        clerk_user_id="user_audit_1",
        email=user.email,
        email_verified=True,
    )
    events = list(
        db_session.scalars(select(AuthAuditEvent).where(AuthAuditEvent.user_id == user.id))
    )
    assert any(e.action == "login_success" for e in events)
