"""Health endpoint tests — Phase 0 scaffold."""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "mizan-api"


def test_health_ready_returns_ok_when_db_up() -> None:
    response = client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["db"] == "up"


def test_health_ready_returns_503_when_db_down() -> None:
    broken_engine = MagicMock()
    broken_engine.connect.side_effect = OSError("connection refused")
    with patch("app.main.engine", broken_engine):
        response = TestClient(app).get("/health/ready")
    assert response.status_code == 503
    data = response.json()
    assert data["status"] == "unavailable"
    assert data["db"] == "down"
