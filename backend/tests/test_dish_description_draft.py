"""Drafting a dish description (MENU_PLAN.md slice 1).

Writing eleven menus' worth of descriptions by hand is the tedious part of
leaving the Word file behind, and the app knows what Dal Tadka is. So it
offers a draft — a draft, never a saving. Nothing reaches a dish without
someone pressing save, because a model that has never eaten in this kitchen
should not describe its food unchallenged. The "or similar" scattered through
these menus exists precisely because the dish varies.

The tests avoid the network entirely: the adapter is where the HTTP call
lives, and what matters here is that the endpoint refuses gracefully when it
is not configured, and hands back exactly what it was given when it is.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.adapters.ocr_ai import dish_description
from app.adapters.ocr_ai.dish_description import (
    DishDescriptionDraft,
    DishDescriptionError,
    draft_dish_description,
)
from app.config import settings


def test_no_endpoint_configured_returns_nothing(monkeypatch):
    """A restaurant without AI configured must still be able to add dishes.

    Returns None rather than raising: the feature is a convenience, and the
    endpoint turns that into a clear 503 rather than an exception.
    """
    monkeypatch.setattr(settings, "expense_receipt_vision_url", None, raising=False)
    assert draft_dish_description("Dal Tadka") is None


def test_a_blank_name_asks_for_nothing(monkeypatch):
    monkeypatch.setattr(
        settings, "expense_receipt_vision_url", "https://example.test/v1", raising=False
    )
    assert draft_dish_description("   ") is None


def test_the_endpoint_says_so_when_drafting_is_unavailable(
    restaurant_a, client: TestClient, monkeypatch
):
    monkeypatch.setattr(
        dish_description, "draft_dish_description", lambda name: None
    )
    resp = client.post(
        f"/entities/{restaurant_a.id}/dishes/suggest-description",
        json={"name": "Dal Tadka"},
    )
    assert resp.status_code == 503, resp.text
    # The message names the setting. The person who sees it is the person who
    # can change it, so "not configured for this deployment" — which is what
    # this said, and what the owner hit — spends the one chance to say how.
    detail = resp.json()["detail"]
    assert "EXPENSE_RECEIPT_VISION_URL" in detail
    assert "by hand" in detail, "no mention of the way forward without it"


def test_a_draft_comes_back_in_both_languages(
    restaurant_a, client: TestClient, monkeypatch
):
    monkeypatch.setattr(
        dish_description,
        "draft_dish_description",
        lambda name: DishDescriptionDraft(
            description="Yellow lentils tempered with cumin and garlic",
            description_tr="Kimyon ve sarımsakla kavrulmuş sarı mercimek",
        ),
    )
    resp = client.post(
        f"/entities/{restaurant_a.id}/dishes/suggest-description",
        json={"name": "Dal Tadka"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["description"].startswith("Yellow lentils")
    assert body["description_tr"].startswith("Kimyon")


def test_drafting_never_writes_a_dish(
    restaurant_a, client: TestClient, monkeypatch
):
    """The whole point: it fills a form, it does not save anything.

    If this ever failed, dishes would appear in the list that nobody chose to
    create — and a description nobody read would be printed to an agency.
    """
    monkeypatch.setattr(
        dish_description,
        "draft_dish_description",
        lambda name: DishDescriptionDraft(description="Anything", description_tr="Bir şey"),
    )
    client.post(
        f"/entities/{restaurant_a.id}/dishes/suggest-description",
        json={"name": "Dal Tadka"},
    )
    listed = client.get(f"/entities/{restaurant_a.id}/dishes?include_inactive=true")
    assert listed.json()["items"] == [], "drafting created a dish"


def test_a_failure_upstream_is_reported_not_swallowed(
    restaurant_a, client: TestClient, monkeypatch
):
    def _boom(name: str):
        raise DishDescriptionError("Description request failed: timed out")

    monkeypatch.setattr(dish_description, "draft_dish_description", _boom)
    resp = client.post(
        f"/entities/{restaurant_a.id}/dishes/suggest-description",
        json={"name": "Dal Tadka"},
    )
    assert resp.status_code == 502, resp.text


def test_a_name_is_required(restaurant_a, client: TestClient):
    resp = client.post(
        f"/entities/{restaurant_a.id}/dishes/suggest-description", json={"name": ""}
    )
    assert resp.status_code == 422, resp.text


def test_drafting_needs_no_idempotency_key(restaurant_a, client: TestClient, monkeypatch):
    """The bug the owner hit: "Idempotency-Key header required" on Draft for me.

    The middleware demands a key on every POST unless the path is exempt, and
    production sets `IDEMPOTENCY_ENFORCEMENT=true` while every local `.env`
    sets it false — so this was invisible until it was deployed.

    Drafting stores nothing, and a key would return a cached first answer.
    Asking twice is how you get a second draft.
    """
    from app.config import settings as app_settings
    from app.core.idempotency.service import should_skip_idempotency

    monkeypatch.setattr(app_settings, "idempotency_enforcement", True, raising=False)
    path = f"/entities/{restaurant_a.id}/dishes/suggest-description"
    assert should_skip_idempotency("POST", path), (
        "suggest-description is not exempt — the Draft button will 400 in production"
    )

    resp = client.post(path, json={"name": "Dal Tadka"})
    assert resp.status_code != 400 or "Idempotency-Key" not in resp.text
