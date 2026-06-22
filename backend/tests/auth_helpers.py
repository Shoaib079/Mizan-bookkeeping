"""Test helpers for Clerk bearer tokens."""

from __future__ import annotations

from app.features.auth.models import User


def clerk_token_for_user(user: User, *, clerk_id: str | None = None) -> str:
    """Build a test-mode Clerk session token for an invited local user."""
    sub = clerk_id or user.external_auth_id or f"clerk_{user.id.hex[:12]}"
    return f"test:{sub}:{user.email}"


def auth_headers(user: User, *, clerk_id: str | None = None) -> dict[str, str]:
    return {"Authorization": f"Bearer {clerk_token_for_user(user, clerk_id=clerk_id)}"}
