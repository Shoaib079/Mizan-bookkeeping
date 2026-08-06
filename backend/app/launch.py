"""Production launch guardrails for auth and CORS settings."""

from __future__ import annotations

import logging

from app.config import _DEFAULT_CORS_ORIGINS, settings

logger = logging.getLogger(__name__)

_LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")


def _is_clerk_test_key(key: str | None) -> bool:
    if not key:
        return False
    normalized = key.strip()
    return normalized.startswith("sk_test_") or normalized.startswith("pk_test_")


def looks_deployed(cors_origins: str, database_url: str) -> bool:
    """Does this process look like it is serving real users?

    Two independent signals, because either alone has a false positive: a
    developer can point at a hosted database while working locally, and a
    CORS list can name a staging origin. Both together means something is
    talking to this from a real browser against real data.

    Takes its inputs rather than reading `settings`, so it can be tested by
    calling it. The version that read the global had to be exercised by
    patching module state, and when that quietly failed to take effect the
    test reported "no warning" — indistinguishable from the code being wrong.
    """
    remote_cors = bool(cors_origins.strip()) and not any(
        host in cors_origins for host in _LOCAL_HOSTS
    )
    remote_db = not any(host in database_url for host in _LOCAL_HOSTS)
    return remote_cors and remote_db


def warn_if_deployed_but_not_production() -> None:
    """Say so when a live-looking deployment is not marked as production.

    Every guard below is written `if settings.is_production`, and `app_env`
    defaults to "development" — so a deployment that simply never set
    APP_ENV gets none of them. Not one check fails; they are all skipped,
    silently, which is the worst way for a safety net to be absent.

    That is not hypothetical. Railway ran with a Clerk `pk_test_` key for
    weeks: the guard that rejects test keys in production was there and
    correct, and never ran. The symptom reached the surface as users being
    logged out, which points nowhere near an unset environment variable.

    Deliberately a log and never a raise. Refusing to boot on a heuristic
    would mean a false positive takes the books offline, and the guards that
    *should* stop a bad launch already exist below. This only makes the
    silence audible.
    """
    if settings.is_production:
        return
    if not looks_deployed(settings.cors_origins, settings.database_url):
        return

    disarmed = [
        "live Clerk keys (sk_test_/pk_test_ accepted)",
        "AUTH_ENFORCEMENT must be on",
        "CLERK_TEST_MODE must be off",
        "CORS_ORIGINS must not be the localhost default",
    ]
    logger.warning(
        "APP_ENV=%r but this looks like a real deployment (remote database, "
        "non-local CORS origins). Every production guard is therefore skipped, "
        "not passed: %s. Set APP_ENV=production — but only in the same deploy "
        "that switches Clerk to live keys, or startup will refuse the test ones.",
        settings.app_env,
        "; ".join(disarmed),
    )


def validate_launch_settings() -> None:
    """Refuse production boot when auth enforcement is disabled."""
    # First, because everything after it is conditional on the flag this
    # checks — and a skipped guard should not be a quiet one.
    warn_if_deployed_but_not_production()

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
        if missing:
            raise RuntimeError(
                "Clerk JWT verification required when auth enforcement is on: "
                + ", ".join(missing)
            )
