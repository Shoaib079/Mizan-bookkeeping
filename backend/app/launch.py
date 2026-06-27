"""Production launch guardrails for auth and CORS settings."""

from __future__ import annotations

from app.config import _DEFAULT_CORS_ORIGINS, settings


def _is_clerk_test_key(key: str | None) -> bool:
    if not key:
        return False
    normalized = key.strip()
    return normalized.startswith("sk_test_") or normalized.startswith("pk_test_")


def validate_launch_settings() -> None:
    """Refuse production boot when auth enforcement is disabled."""
    if settings.is_production and not settings.auth_enforcement:
        raise RuntimeError(
            "AUTH_ENFORCEMENT must be true in production (APP_ENV=production)"
        )

    if settings.is_production and settings.clerk_test_mode:
        raise RuntimeError("CLERK_TEST_MODE must be off in production")

    if settings.is_production and settings.cors_origins.strip() == _DEFAULT_CORS_ORIGINS:
        raise RuntimeError(
            "CORS_ORIGINS must be set to production frontend URL(s) "
            "(localhost default is not allowed when APP_ENV=production)"
        )

    if settings.is_production:
        for env_name, key_value in (
            ("CLERK_SECRET_KEY", settings.clerk_secret_key),
            ("CLERK_PUBLISHABLE_KEY", settings.clerk_publishable_key),
        ):
            if _is_clerk_test_key(key_value):
                raise RuntimeError(
                    f"{env_name} must be a live Clerk key in production (sk_test_/pk_test_ rejected)"
                )

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
