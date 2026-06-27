"""CORS origins config — Phase 12 Slice 12.1 hosting."""

from fastapi.testclient import TestClient

from app.config import parse_cors_origins, settings
from app.main import app

client = TestClient(app)


def test_parse_cors_origins_splits_and_strips() -> None:
    assert parse_cors_origins("http://localhost:3000,http://127.0.0.1:3000") == [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def test_parse_cors_origins_ignores_empty_segments() -> None:
    assert parse_cors_origins("https://app.example.com,, https://staging.example.com ") == [
        "https://app.example.com",
        "https://staging.example.com",
    ]


def test_settings_default_cors_includes_localhost_dev() -> None:
    assert "http://localhost:3000" in settings.cors_origins_list
    assert "http://127.0.0.1:3000" in settings.cors_origins_list


def test_cors_preflight_allows_localhost_origin() -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
