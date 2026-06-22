"""Clerk session JWT verification via JWKS (Phase 8 launch)."""

from __future__ import annotations

import logging
from typing import Any

import jwt
from jwt import PyJWKClient

from app.config import settings
from app.core.auth.clerk_claims import ClerkClaims

logger = logging.getLogger(__name__)


class ClerkTokenError(Exception):
    """Invalid, expired, or untrusted Clerk session token."""


_jwk_client: PyJWKClient | None = None


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        if not settings.clerk_jwks_url:
            raise ClerkTokenError("Clerk JWKS URL is not configured")
        _jwk_client = PyJWKClient(settings.clerk_jwks_url, cache_keys=True)
    return _jwk_client


def reset_jwk_client_for_tests() -> None:
    """Clear cached JWKS client (tests only)."""
    global _jwk_client
    _jwk_client = None


def _extract_email(claims: dict[str, Any]) -> tuple[str, bool]:
    email = claims.get("email")
    if isinstance(email, str) and email.strip():
        return email.strip().lower(), claims.get("email_verified") is True

    raise ClerkTokenError("Verified email claim missing from token")


def verify_clerk_token(token: str) -> ClerkClaims:
    """Validate signature, issuer, audience, and expiry against Clerk JWKS."""
    if not token or not token.strip():
        raise ClerkTokenError("Bearer token required")

    if settings.clerk_test_mode:
        return _verify_test_token(token.strip())

    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        decode_kwargs: dict[str, Any] = {
            "algorithms": ["RS256"],
            "options": {"require": ["exp", "sub", "iss"]},
        }
        if settings.clerk_issuer:
            decode_kwargs["issuer"] = settings.clerk_issuer
        if settings.clerk_audience:
            decode_kwargs["audience"] = settings.clerk_audience
        claims = jwt.decode(token, signing_key.key, **decode_kwargs)
    except jwt.PyJWTError as exc:
        logger.warning("Clerk token verification failed: %s", exc)
        raise ClerkTokenError("Invalid or expired session token") from exc

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise ClerkTokenError("Token missing subject")

    email, email_verified = _extract_email(claims)
    if not email_verified:
        raise ClerkTokenError("Email address is not verified")

    return ClerkClaims(clerk_user_id=sub.strip(), email=email, email_verified=True)


def _verify_test_token(token: str) -> ClerkClaims:
    """Deterministic test tokens: ``test:{clerk_id}:{email}`` or ``...:unverified`` suffix."""
    if not token.startswith("test:"):
        if token in {"invalid", "tampered", "expired"}:
            raise ClerkTokenError("Invalid or expired session token")
        raise ClerkTokenError("Invalid or expired session token")

    rest = token[5:]
    email_verified = True
    if rest.endswith(":unverified"):
        email_verified = False
        rest = rest[: -len(":unverified")]

    clerk_id, sep, email = rest.partition(":")
    if not sep or not clerk_id or "@" not in email:
        raise ClerkTokenError("Malformed test token")

    if not email_verified:
        raise ClerkTokenError("Email address is not verified")

    return ClerkClaims(
        clerk_user_id=clerk_id,
        email=email.strip().lower(),
        email_verified=email_verified,
    )
