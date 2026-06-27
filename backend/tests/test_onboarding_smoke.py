"""Owner onboarding smoke — shared HTTP path (Phase 12 Slice 12.6)."""

from __future__ import annotations

from datetime import date

from app.smoke.onboarding import run_onboarding_smoke
from tests.auth_helpers import auth_headers
from tests.test_roles_permissions import _create_user, auth_enforced


def test_onboarding_smoke_path_dev_auth(client) -> None:
    """Cold-start API path with AUTH_ENFORCEMENT=false (pytest default)."""
    result = run_onboarding_smoke(
        client,
        entity_name="Pytest Smoke Cafe",
        member_email="pytest-smoke-staff@example.com",
        go_live_date=date(2026, 6, 1),
    )
    assert result.entity_id
    assert result.cash_account_id
    assert result.report_net_income_kurus == -5_000


def test_onboarding_smoke_path_auth_enforced(
    auth_enforced,
    client,
    db_session,
) -> None:
    owner = _create_user(db_session, "smoke-auth-owner@example.com", "Smoke Owner")
    headers = auth_headers(owner)

    result = run_onboarding_smoke(
        client,
        headers=headers,
        entity_name="Auth Smoke Cafe",
        member_email="pytest-smoke-auth-staff@example.com",
        go_live_date=date(2026, 6, 1),
    )
    assert result.entity_id
    assert result.report_net_income_kurus == -5_000
