"""Send Clerk application invitations (email link → sign-up)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

from app.config import settings

logger = logging.getLogger(__name__)

CLERK_INVITATIONS_URL = "https://api.clerk.com/v1/invitations"

InviteOutcome = Literal["sent", "skipped", "failed"]


@dataclass(frozen=True)
class ClerkInviteResult:
    outcome: InviteOutcome
    detail: str | None = None
    invitation_id: str | None = None

    @property
    def sent(self) -> bool:
        return self.outcome == "sent"


class ClerkInviteError(Exception):
    """Clerk rejected or could not create an invitation."""


def sign_up_redirect_url() -> str | None:
    """Where Clerk sends the user after they open the invite link."""
    base = (settings.public_app_url or "").strip().rstrip("/")
    if not base:
        return None
    return f"{base}/sign-up"


def create_clerk_invitation(email: str) -> ClerkInviteResult:
    """Create a Clerk invitation; Clerk emails the sign-up link.

    Skips when the secret key is missing or ``clerk_test_mode`` is on (pytest).
    """
    normalized = email.strip().lower()
    if not normalized:
        return ClerkInviteResult(outcome="failed", detail="Email required")

    if settings.clerk_test_mode:
        return ClerkInviteResult(
            outcome="skipped",
            detail="Clerk test mode — invitation email not sent",
        )

    secret = (settings.clerk_secret_key or "").strip()
    if not secret:
        return ClerkInviteResult(
            outcome="skipped",
            detail="CLERK_SECRET_KEY not configured — invitation email not sent",
        )

    body: dict[str, Any] = {
        "email_address": normalized,
        # Replace a pending invite for the same email instead of 400-ing.
        "ignore_existing": True,
    }
    redirect = sign_up_redirect_url()
    if redirect:
        body["redirect_url"] = redirect

    import httpx

    try:
        with httpx.Client(timeout=15.0) as client:
            response = client.post(
                CLERK_INVITATIONS_URL,
                headers={
                    "Authorization": f"Bearer {secret}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
    except httpx.HTTPError as exc:
        logger.warning("Clerk invitation request failed for %s: %s", normalized, exc)
        raise ClerkInviteError(
            "Could not reach Clerk to send the invitation email."
        ) from exc

    if response.status_code in (200, 201):
        data = response.json()
        invitation_id = data.get("id") if isinstance(data, dict) else None
        return ClerkInviteResult(
            outcome="sent",
            detail="Invitation email sent",
            invitation_id=str(invitation_id) if invitation_id else None,
        )

    # Already a Clerk user — they can sign in; membership is enough.
    detail = _clerk_error_detail(response)
    if response.status_code == 400 and _looks_like_already_user(detail):
        return ClerkInviteResult(
            outcome="skipped",
            detail="That email already has a Clerk account — they can sign in",
        )

    logger.warning(
        "Clerk invitation failed for %s: %s %s",
        normalized,
        response.status_code,
        detail,
    )
    raise ClerkInviteError(detail or "Clerk could not send the invitation email.")


def _clerk_error_detail(response: Any) -> str:
    try:
        data = response.json()
    except ValueError:
        return response.text.strip() or f"Clerk HTTP {response.status_code}"
    if isinstance(data, dict):
        errors = data.get("errors")
        if isinstance(errors, list) and errors:
            first = errors[0]
            if isinstance(first, dict):
                message = first.get("long_message") or first.get("message")
                if message:
                    return str(message)
        message = data.get("message")
        if message:
            return str(message)
    return f"Clerk HTTP {response.status_code}"


def _looks_like_already_user(detail: str) -> bool:
    lowered = detail.lower()
    return any(
        needle in lowered
        for needle in (
            "already exists",
            "already been taken",
            "identifier already",
            "user already",
            "already a user",
        )
    )
