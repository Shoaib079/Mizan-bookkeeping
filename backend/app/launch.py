"""Production launch guardrails for auth settings."""

from __future__ import annotations

from app.config import settings


def validate_launch_settings() -> None:
    """Refuse production boot when auth enforcement is disabled."""
    if settings.is_production and not settings.auth_enforcement:
        raise RuntimeError(
            "AUTH_ENFORCEMENT must be true in production (APP_ENV=production)"
        )

    if settings.is_production and settings.clerk_test_mode:
        raise RuntimeError("CLERK_TEST_MODE must be off in production")

    if settings.auth_enforcement and not settings.clerk_test_mode:
        missing = []
        if not settings.clerk_jwks_url:
            missing.append("CLERK_JWKS_URL")
        if not settings.clerk_issuer:
            missing.append("CLERK_ISSUER")
        if not settings.clerk_audience:
            missing.append("CLERK_AUDIENCE")
        if missing:
            raise RuntimeError(
                "Clerk JWT verification required when auth enforcement is on: "
                + ", ".join(missing)
            )
