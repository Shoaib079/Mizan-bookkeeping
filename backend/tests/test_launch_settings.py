"""Production launch guardrails — Phase 12 Slice 12.2."""

from __future__ import annotations

import pytest

from app.config import _DEFAULT_CORS_ORIGINS, settings
from app.launch import validate_launch_settings


def test_production_refuses_localhost_cors_default(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", False)
    monkeypatch.setattr(settings, "cors_origins", _DEFAULT_CORS_ORIGINS)
    monkeypatch.setattr(settings, "clerk_secret_key", "sk_live_example")
    monkeypatch.setattr(settings, "clerk_publishable_key", "pk_live_example")
    monkeypatch.setattr(settings, "clerk_jwks_url", "https://example.test/jwks.json")
    monkeypatch.setattr(settings, "clerk_issuer", "https://example.test")
    monkeypatch.setattr(settings, "clerk_audience", "pk_live_example")
    with pytest.raises(RuntimeError, match="CORS_ORIGINS"):
        validate_launch_settings()


def test_production_refuses_clerk_test_secret_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", False)
    monkeypatch.setattr(settings, "cors_origins", "https://app.example.com")
    monkeypatch.setattr(settings, "clerk_secret_key", "sk_test_secret")
    monkeypatch.setattr(settings, "clerk_publishable_key", "pk_live_example")
    monkeypatch.setattr(settings, "clerk_jwks_url", "https://example.test/jwks.json")
    monkeypatch.setattr(settings, "clerk_issuer", "https://example.test")
    monkeypatch.setattr(settings, "clerk_audience", "pk_live_example")
    with pytest.raises(RuntimeError, match="CLERK_SECRET_KEY"):
        validate_launch_settings()


def test_production_refuses_clerk_test_publishable_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", False)
    monkeypatch.setattr(settings, "cors_origins", "https://app.example.com")
    monkeypatch.setattr(settings, "clerk_secret_key", "sk_live_secret")
    monkeypatch.setattr(settings, "clerk_publishable_key", "pk_test_public")
    monkeypatch.setattr(settings, "clerk_jwks_url", "https://example.test/jwks.json")
    monkeypatch.setattr(settings, "clerk_issuer", "https://example.test")
    monkeypatch.setattr(settings, "clerk_audience", "pk_live_example")
    with pytest.raises(RuntimeError, match="CLERK_PUBLISHABLE_KEY"):
        validate_launch_settings()


def test_production_accepts_valid_launch_config(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "auth_enforcement", True)
    monkeypatch.setattr(settings, "clerk_test_mode", False)
    monkeypatch.setattr(settings, "cors_origins", "https://app.example.com")
    monkeypatch.setattr(settings, "clerk_secret_key", "sk_live_secret")
    monkeypatch.setattr(settings, "clerk_publishable_key", "pk_live_public")
    monkeypatch.setattr(settings, "clerk_jwks_url", "https://example.test/jwks.json")
    monkeypatch.setattr(settings, "clerk_issuer", "https://example.test")
    monkeypatch.setattr(settings, "clerk_audience", "pk_live_example")
    validate_launch_settings()
