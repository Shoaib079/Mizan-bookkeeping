"""Copying a dish list between restaurants (MENU_PLAN.md §9).

Menus are kept per restaurant because the locations are separate companies
with separate VKNs. That is the right call and it has one cost: a new
restaurant starts with an empty list. This is the one-click seed — a **copy**,
so the rows belong to the target and diverge from that moment.

It is also the only place menu data crosses the entity boundary, which is why
the access check on the *source* restaurant is the test that matters most.
Row-level security protects a session, not a function, and this function
deliberately opens two.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _add(client: TestClient, entity_id, name: str, **fields):
    body = {"name": name}
    body.update(fields)
    return client.post(f"/entities/{entity_id}/dishes", json=body)


def _names(client: TestClient, entity_id) -> list[str]:
    listed = client.get(f"/entities/{entity_id}/dishes?include_inactive=true").json()
    return [d["name"] for d in listed["items"]]


def test_dishes_are_copied_into_the_empty_restaurant(
    restaurant_a, restaurant_b, client: TestClient
):
    _add(client, restaurant_a.id, "Dal Tadka", description="Yellow lentils")
    _add(client, restaurant_a.id, "White Rice")

    resp = client.post(
        f"/entities/{restaurant_b.id}/dishes/copy-from",
        json={"source_entity_id": str(restaurant_a.id)},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["copied"] == 2
    assert _names(client, restaurant_b.id) == ["Dal Tadka", "White Rice"]


def test_the_copy_carries_descriptions_and_suitability(
    restaurant_a, restaurant_b, client: TestClient
):
    _add(
        client,
        restaurant_a.id,
        "Butter Chicken",
        description="Tandoori chicken in a tomato gravy",
        description_tr="Domates soslu tandır tavuk",
        suits_veg=False,
        suits_jain=False,
    )
    client.post(
        f"/entities/{restaurant_b.id}/dishes/copy-from",
        json={"source_entity_id": str(restaurant_a.id)},
    )
    copied = client.get(f"/entities/{restaurant_b.id}/dishes").json()["items"][0]
    assert copied["description"] == "Tandoori chicken in a tomato gravy"
    assert copied["description_tr"] == "Domates soslu tandır tavuk"
    assert copied["suits_veg"] is False
    assert copied["suits_jain"] is False


def test_the_two_lists_diverge_afterwards(
    restaurant_a, restaurant_b, client: TestClient
):
    """A copy, not a link — which is the whole point of keeping them separate."""
    _add(client, restaurant_a.id, "Desert")
    client.post(
        f"/entities/{restaurant_b.id}/dishes/copy-from",
        json={"source_entity_id": str(restaurant_a.id)},
    )
    copied_id = client.get(f"/entities/{restaurant_b.id}/dishes").json()["items"][0]["id"]

    client.patch(
        f"/entities/{restaurant_b.id}/dishes/{copied_id}", json={"name": "Dessert"}
    )

    assert _names(client, restaurant_b.id) == ["Dessert"]
    assert _names(client, restaurant_a.id) == ["Desert"], (
        "editing the copy changed the original"
    )


def test_names_already_present_are_skipped_not_overwritten(
    restaurant_a, restaurant_b, client: TestClient
):
    """A restaurant that has started editing its own wording keeps it."""
    _add(client, restaurant_a.id, "Dal Tadka", description="From restaurant A")
    _add(client, restaurant_b.id, "Dal Tadka", description="Ours, already written")
    _add(client, restaurant_a.id, "White Rice")

    resp = client.post(
        f"/entities/{restaurant_b.id}/dishes/copy-from",
        json={"source_entity_id": str(restaurant_a.id)},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["copied"] == 1
    assert resp.json()["skipped"] == ["Dal Tadka"]

    kept = [
        d
        for d in client.get(f"/entities/{restaurant_b.id}/dishes").json()["items"]
        if d["name"] == "Dal Tadka"
    ][0]
    assert kept["description"] == "Ours, already written"


def test_a_name_differing_only_by_case_is_still_a_duplicate(
    restaurant_a, restaurant_b, client: TestClient
):
    """"DAL TADKA" and "Dal Tadka" are the same dish to a reader."""
    _add(client, restaurant_a.id, "Dal Tadka")
    _add(client, restaurant_b.id, "DAL TADKA")

    resp = client.post(
        f"/entities/{restaurant_b.id}/dishes/copy-from",
        json={"source_entity_id": str(restaurant_a.id)},
    )
    assert resp.json()["copied"] == 0
    assert resp.json()["skipped"] == ["Dal Tadka"]


def test_retired_dishes_are_not_carried_over(
    restaurant_a, restaurant_b, client: TestClient
):
    """A dish the source stopped serving is not worth seeding elsewhere."""
    created = _add(client, restaurant_a.id, "Fish Masala").json()
    client.patch(
        f"/entities/{restaurant_a.id}/dishes/{created['id']}",
        json={"is_active": False},
    )
    resp = client.post(
        f"/entities/{restaurant_b.id}/dishes/copy-from",
        json={"source_entity_id": str(restaurant_a.id)},
    )
    assert resp.json()["copied"] == 0
    assert _names(client, restaurant_b.id) == []


def test_copying_from_itself_is_rejected(restaurant_a, client: TestClient):
    resp = client.post(
        f"/entities/{restaurant_a.id}/dishes/copy-from",
        json={"source_entity_id": str(restaurant_a.id)},
    )
    assert resp.status_code == 422, resp.text


def test_an_unknown_source_is_404(restaurant_a, client: TestClient):
    resp = client.post(
        f"/entities/{restaurant_a.id}/dishes/copy-from",
        json={"source_entity_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 404, resp.text


def test_copying_an_empty_list_is_harmless(
    restaurant_a, restaurant_b, client: TestClient
):
    resp = client.post(
        f"/entities/{restaurant_b.id}/dishes/copy-from",
        json={"source_entity_id": str(restaurant_a.id)},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"copied": 0, "skipped": []}
