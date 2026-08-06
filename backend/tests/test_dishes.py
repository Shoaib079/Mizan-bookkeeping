"""Dishes — the reusable menu ingredient list (MENU_PLAN.md slice 1).

A dish is written once and referenced by however many menus serve it. The Word
document this replaces typed Dal Tadka, White Rice and Tandoori Naan
separately into eleven menus, which is how "DESERT" survived three years and
how the Jain menu came to list White Rice twice.

Per restaurant, deliberately — the locations are separate companies with
separate VKNs. The isolation test at the bottom is the one that matters most:
it is the guarantee that made "keep everything separate" the right choice.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _create(client: TestClient, entity_id, **fields):
    body = {"name": "Dal Tadka"}
    body.update(fields)
    return client.post(f"/entities/{entity_id}/dishes", json=body)


def test_a_dish_can_be_created_and_read_back(restaurant_a, client: TestClient):
    resp = _create(
        client,
        restaurant_a.id,
        description="Yellow lentils tempered with cumin",
        dietary="veg",
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Dal Tadka"
    assert body["description"] == "Yellow lentils tempered with cumin"
    assert body["dietary"] == "veg"
    assert body["is_active"] is True

    got = client.get(f"/entities/{restaurant_a.id}/dishes/{body['id']}")
    assert got.status_code == 200, got.text
    assert got.json()["name"] == "Dal Tadka"


def test_a_dish_needs_no_description(restaurant_a, client: TestClient):
    """The current menus have none — descriptions are what is being added."""
    resp = _create(client, restaurant_a.id, name="White Rice")
    assert resp.status_code == 201, resp.text
    assert resp.json()["description"] is None
    assert resp.json()["dietary"] is None


def test_a_blank_description_is_stored_as_absent(restaurant_a, client: TestClient):
    """A form posts "" for a field left alone.

    Stored literally, an empty description is indistinguishable from a missing
    one and prints as a blank line under the dish on the PDF.
    """
    resp = _create(client, restaurant_a.id, name="Raita", description="   ")
    assert resp.status_code == 201, resp.text
    assert resp.json()["description"] is None


def test_the_name_is_trimmed(restaurant_a, client: TestClient):
    resp = _create(client, restaurant_a.id, name="  Tandoori Naan  ")
    assert resp.status_code == 201, resp.text
    assert resp.json()["name"] == "Tandoori Naan"


def test_a_blank_name_is_rejected(restaurant_a, client: TestClient):
    resp = _create(client, restaurant_a.id, name="   ")
    assert resp.status_code == 422, resp.text


def test_the_same_dish_cannot_be_added_twice(restaurant_a, client: TestClient):
    """Two "Dal Tadka" rows means one of them gets picked by mistake."""
    assert _create(client, restaurant_a.id).status_code == 201
    duplicate = _create(client, restaurant_a.id)
    assert duplicate.status_code == 409, duplicate.text


def test_a_dish_can_be_renamed_and_described(restaurant_a, client: TestClient):
    """The point of the whole design: correcting a spelling is one edit."""
    created = _create(client, restaurant_a.id, name="Desert").json()
    resp = client.patch(
        f"/entities/{restaurant_a.id}/dishes/{created['id']}",
        json={"name": "Dessert", "description": "Chef's selection of the day"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Dessert"
    assert resp.json()["description"] == "Chef's selection of the day"


def test_a_description_can_be_cleared(restaurant_a, client: TestClient):
    """Sending null means remove it.

    A plain `is not None` check would treat that as "unchanged" and silently
    refuse to clear a description someone wanted gone.
    """
    created = _create(client, restaurant_a.id, description="Wrong text").json()
    resp = client.patch(
        f"/entities/{restaurant_a.id}/dishes/{created['id']}",
        json={"description": None},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["description"] is None


def test_a_retired_dish_is_hidden_but_not_deleted(restaurant_a, client: TestClient):
    """Menus that still list it must keep reading correctly."""
    created = _create(client, restaurant_a.id, name="Fish Masala").json()
    client.patch(
        f"/entities/{restaurant_a.id}/dishes/{created['id']}",
        json={"is_active": False},
    )

    listed = client.get(f"/entities/{restaurant_a.id}/dishes").json()
    assert [d["name"] for d in listed["items"]] == []

    with_inactive = client.get(
        f"/entities/{restaurant_a.id}/dishes?include_inactive=true"
    ).json()
    assert [d["name"] for d in with_inactive["items"]] == ["Fish Masala"]


def test_dishes_are_listed_alphabetically(restaurant_a, client: TestClient):
    for name in ("White Rice", "Butter Chicken", "Dal Tadka"):
        _create(client, restaurant_a.id, name=name)
    listed = client.get(f"/entities/{restaurant_a.id}/dishes").json()
    assert [d["name"] for d in listed["items"]] == [
        "Butter Chicken",
        "Dal Tadka",
        "White Rice",
    ]


def test_search_matches_name_and_description(restaurant_a, client: TestClient):
    _create(client, restaurant_a.id, name="Butter Chicken", description="Tandoori")
    _create(client, restaurant_a.id, name="Chicken Kadai", description="With peppers")

    by_name = client.get(f"/entities/{restaurant_a.id}/dishes?q=kadai").json()
    assert [d["name"] for d in by_name["items"]] == ["Chicken Kadai"]

    by_description = client.get(f"/entities/{restaurant_a.id}/dishes?q=tandoori").json()
    assert [d["name"] for d in by_description["items"]] == ["Butter Chicken"]


def test_an_unknown_dish_is_404(restaurant_a, client: TestClient):
    resp = client.get(f"/entities/{restaurant_a.id}/dishes/{uuid.uuid4()}")
    assert resp.status_code == 404, resp.text


def test_one_restaurant_cannot_see_another_s_dishes(
    restaurant_a, restaurant_b, client: TestClient
):
    """The guarantee that made "keep everything separate" the right choice.

    India Gate and Spice Corner are different companies with different VKNs.
    Menus were kept per restaurant rather than shared precisely so this holds,
    enforced by row-level security rather than by a WHERE clause someone could
    forget.
    """
    _create(client, restaurant_a.id, name="Dal Tadka")

    other = client.get(f"/entities/{restaurant_b.id}/dishes").json()
    assert other["items"] == [], "a dish leaked across restaurants"

    # And the same name is free to exist independently in the other one.
    resp = _create(client, restaurant_b.id, name="Dal Tadka")
    assert resp.status_code == 201, resp.text
