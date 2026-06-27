"""Observability — Sentry, structured logging, rate limiting (Phase 12 Slice 12.4)."""

from __future__ import annotations

import json
import logging
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.core.observability.logging_config import JsonFormatter, configure_logging
from app.core.observability.sentry_init import init_sentry
from app.main import app


def test_sentry_init_runs_when_dsn_set(monkeypatch) -> None:
    monkeypatch.setattr(settings, "sentry_dsn", "https://example@test.ingest.sentry.io/1")
    with patch("sentry_sdk.init") as mock_init:
        init_sentry(settings.sentry_dsn, "production")
    mock_init.assert_called_once()
    assert mock_init.call_args.kwargs["dsn"] == "https://example@test.ingest.sentry.io/1"


def test_sentry_init_skipped_when_dsn_missing(monkeypatch) -> None:
    monkeypatch.setattr(settings, "sentry_dsn", None)
    with patch("sentry_sdk.init") as mock_init:
        init_sentry(settings.sentry_dsn, "test")
    mock_init.assert_not_called()


def test_app_boots_without_sentry_dsn(monkeypatch) -> None:
    monkeypatch.setattr(settings, "sentry_dsn", None)
    response = TestClient(app).get("/health")
    assert response.status_code == 200


def test_production_logging_uses_json_formatter() -> None:
    configure_logging("production")
    root = logging.getLogger()
    assert len(root.handlers) == 1
    assert isinstance(root.handlers[0].formatter, JsonFormatter)

    record = logging.LogRecord(
        name="mizan.request",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="GET /health 200 1.2ms",
        args=(),
        exc_info=None,
    )
    record.request_id = "req-123"
    record.method = "GET"
    record.path = "/health"
    record.status_code = 200
    record.duration_ms = 1.2

    payload = json.loads(root.handlers[0].formatter.format(record))
    assert payload["level"] == "INFO"
    assert payload["request_id"] == "req-123"
    assert payload["method"] == "GET"
    assert payload["status_code"] == 200


def test_rate_limit_returns_429_when_exceeded(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "rate_limit_per_minute", 2)

    client = TestClient(app)
    for _ in range(2):
        ok = client.get("/")
        assert ok.status_code == 200

    limited = client.get("/")
    assert limited.status_code == 429
    assert "Rate limit exceeded" in limited.json()["detail"]


def test_rate_limit_skipped_on_health(monkeypatch) -> None:
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "rate_limit_per_minute", 1)

    client = TestClient(app)
    for _ in range(5):
        response = client.get("/health")
        assert response.status_code == 200

    ready = client.get("/health/ready")
    assert ready.status_code == 200
