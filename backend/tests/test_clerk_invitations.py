"""Clerk invitation helper — no live Clerk calls."""

from __future__ import annotations

import httpx
import pytest

from app.config import settings
from app.core.auth.clerk_invitations import (
    ClerkInviteError,
    create_clerk_invitation,
    sign_up_redirect_url,
)


@pytest.fixture(autouse=True)
def _invite_settings(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "clerk_test_mode", False)
    monkeypatch.setattr(settings, "clerk_secret_key", "sk_test_fake")
    monkeypatch.setattr(settings, "public_app_url", "https://app.example.com")


def test_sign_up_redirect_url_appends_path() -> None:
    assert sign_up_redirect_url() == "https://app.example.com/sign-up"


def test_create_invitation_skipped_in_clerk_test_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "clerk_test_mode", True)
    result = create_clerk_invitation("cashier@example.com")
    assert result.outcome == "skipped"
    assert result.sent is False


def test_create_invitation_skipped_without_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "clerk_secret_key", None)
    result = create_clerk_invitation("cashier@example.com")
    assert result.outcome == "skipped"


def test_create_invitation_posts_to_clerk(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict = {}

    class FakeResponse:
        status_code = 200

        def json(self) -> dict:
            return {"id": "inv_123"}

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self) -> FakeClient:
            return self

        def __exit__(self, *args) -> None:
            return None

        def post(self, url: str, headers: dict, json: dict) -> FakeResponse:
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(httpx, "Client", FakeClient)
    result = create_clerk_invitation("Cashier@Example.com")
    assert result.outcome == "sent"
    assert result.invitation_id == "inv_123"
    assert captured["json"]["email_address"] == "cashier@example.com"
    assert captured["json"]["ignore_existing"] is True
    assert captured["json"]["redirect_url"] == "https://app.example.com/sign-up"
    assert captured["headers"]["Authorization"] == "Bearer sk_test_fake"


def test_create_invitation_already_user_is_skipped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeResponse:
        status_code = 400
        text = "exists"

        def json(self) -> dict:
            return {
                "errors": [
                    {
                        "message": "That email address is taken. Please try another.",
                        "long_message": "identifier already exists",
                    }
                ]
            }

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self) -> FakeClient:
            return self

        def __exit__(self, *args) -> None:
            return None

        def post(self, *args, **kwargs) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr(httpx, "Client", FakeClient)
    result = create_clerk_invitation("taken@example.com")
    assert result.outcome == "skipped"
    assert "already" in (result.detail or "").lower()


def test_create_invitation_other_errors_raise(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeResponse:
        status_code = 500
        text = "boom"

        def json(self) -> dict:
            return {"errors": [{"message": "internal"}]}

    class FakeClient:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def __enter__(self) -> FakeClient:
            return self

        def __exit__(self, *args) -> None:
            return None

        def post(self, *args, **kwargs) -> FakeResponse:
            return FakeResponse()

    monkeypatch.setattr(httpx, "Client", FakeClient)
    with pytest.raises(ClerkInviteError, match="internal"):
        create_clerk_invitation("x@example.com")
