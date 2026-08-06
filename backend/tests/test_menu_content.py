"""Menus gain a price, a category and an ordered dish list (slice 2).

Until now a group menu was a name. The Word document it replaces carries a
price marked "+KDV", a grouping, and dishes in a deliberate order — rice, naan
and dessert last.

The dish list is references rather than text, which is what makes correcting
"Desert" a single edit. Two of the tests below exist because of specific
errors in that document: the Jain menu listing White Rice twice, and the
Cappadocia headers that came from copying between restaurants.
"""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def _dish(client: TestClient, entity_id, name: str) -> str:
    resp = client.post(f"/entities/{entity_id}/dishes", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _menu(client: TestClient, entity_id, **fields) -> dict:
    body = {"name": "Veg Menu 1"}
    body.update(fields)
    resp = client.post(f"/entities/{entity_id}/group-menus", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _set_lines(client: TestClient, entity_id, menu_id, lines):
    return client.put(
        f"/entities/{entity_id}/group-menus/{menu_id}/lines", json=lines
    )


def test_a_menu_carries_a_price_and_a_category(restaurant_a, client: TestClient):
    menu = _menu(
        client,
        restaurant_a.id,
        price_minor=1500,
        currency="USD",
        category="veg",
        sort_order=1,
    )
    assert menu["price_minor"] == 1500
    assert menu["currency"] == "USD"
    assert menu["category"] == "veg"
    assert menu["price_excludes_vat"] is True, "every current menu is +KDV"


def test_a_catering_surcharge_is_separate_from_the_price(
    restaurant_a, client: TestClient
):
    """"$27 + $2 catering charges" is two figures, quoted separately."""
    menu = _menu(
        client,
        restaurant_a.id,
        name="Catering Menu 1",
        price_minor=2700,
        surcharge_minor=200,
        surcharge_label="catering charges",
        category="catering",
    )
    assert menu["price_minor"] == 2700
    assert menu["surcharge_minor"] == 200
    assert menu["surcharge_label"] == "catering charges"


def test_a_menu_without_a_price_is_allowed(restaurant_a, client: TestClient):
    """Menus existed before prices did; an unpriced one is legitimate."""
    menu = _menu(client, restaurant_a.id, name="Draft menu")
    assert menu["price_minor"] is None


def test_a_price_can_be_cleared(restaurant_a, client: TestClient):
    menu = _menu(client, restaurant_a.id, price_minor=1500)
    resp = client.patch(
        f"/entities/{restaurant_a.id}/group-menus/{menu['id']}",
        json={"price_minor": None},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["price_minor"] is None


def test_dishes_are_kept_in_the_order_given(restaurant_a, client: TestClient):
    """Rice, naan and dessert belong at the end, and that is per menu."""
    menu = _menu(client, restaurant_a.id)
    dal = _dish(client, restaurant_a.id, "Dal Tadka")
    rice = _dish(client, restaurant_a.id, "White Rice")
    naan = _dish(client, restaurant_a.id, "Tandoori Naan")

    resp = _set_lines(
        client,
        restaurant_a.id,
        menu["id"],
        [{"dish_id": dal}, {"dish_id": rice}, {"dish_id": naan}],
    )
    assert resp.status_code == 200, resp.text
    assert [line["dish_name"] for line in resp.json()["lines"]] == [
        "Dal Tadka",
        "White Rice",
        "Tandoori Naan",
    ]
    assert [line["sort_order"] for line in resp.json()["lines"]] == [0, 1, 2]


def test_reordering_replaces_the_whole_list(restaurant_a, client: TestClient):
    menu = _menu(client, restaurant_a.id)
    dal = _dish(client, restaurant_a.id, "Dal Tadka")
    rice = _dish(client, restaurant_a.id, "White Rice")
    _set_lines(client, restaurant_a.id, menu["id"], [{"dish_id": dal}, {"dish_id": rice}])

    resp = _set_lines(
        client, restaurant_a.id, menu["id"], [{"dish_id": rice}, {"dish_id": dal}]
    )
    assert [line["dish_name"] for line in resp.json()["lines"]] == [
        "White Rice",
        "Dal Tadka",
    ]


def test_a_line_can_carry_a_note(restaurant_a, client: TestClient):
    """"or similar" appears on a dozen lines of the current document.

    It lives on the line, not in the dish name — otherwise "Mix Veg Curry or
    similar" would be the dish, and useless on any menu that serves it plainly.
    """
    menu = _menu(client, restaurant_a.id)
    curry = _dish(client, restaurant_a.id, "Mix Veg Curry")
    resp = _set_lines(
        client,
        restaurant_a.id,
        menu["id"],
        [{"dish_id": curry, "note": "or similar"}],
    )
    assert resp.json()["lines"][0]["note"] == "or similar"
    assert resp.json()["lines"][0]["dish_name"] == "Mix Veg Curry"


def test_the_same_dish_twice_on_one_menu_is_refused(restaurant_a, client: TestClient):
    """The Jain menu listed White Rice twice, in 2023 and again in 2026.

    In a Word table that is invisible. Here it is refused.
    """
    menu = _menu(client, restaurant_a.id)
    rice = _dish(client, restaurant_a.id, "White Rice")
    resp = _set_lines(
        client, restaurant_a.id, menu["id"], [{"dish_id": rice}, {"dish_id": rice}]
    )
    assert resp.status_code == 422, resp.text
    assert "twice" in resp.json()["detail"]


def test_the_line_list_can_be_emptied(restaurant_a, client: TestClient):
    menu = _menu(client, restaurant_a.id)
    dal = _dish(client, restaurant_a.id, "Dal Tadka")
    _set_lines(client, restaurant_a.id, menu["id"], [{"dish_id": dal}])
    resp = _set_lines(client, restaurant_a.id, menu["id"], [])
    assert resp.status_code == 200, resp.text
    assert resp.json()["lines"] == []


def test_renaming_a_dish_changes_every_menu_that_serves_it(
    restaurant_a, client: TestClient
):
    """The entire reason this is a reference and not a copy."""
    first = _menu(client, restaurant_a.id, name="Veg Menu 1")
    second = _menu(client, restaurant_a.id, name="Veg Menu 2")
    desert = _dish(client, restaurant_a.id, "Desert")
    _set_lines(client, restaurant_a.id, first["id"], [{"dish_id": desert}])
    _set_lines(client, restaurant_a.id, second["id"], [{"dish_id": desert}])

    client.patch(
        f"/entities/{restaurant_a.id}/dishes/{desert}", json={"name": "Dessert"}
    )

    for menu_id in (first["id"], second["id"]):
        read = client.get(f"/entities/{restaurant_a.id}/group-menus/{menu_id}").json()
        assert [line["dish_name"] for line in read["lines"]] == ["Dessert"]


def test_a_dish_from_another_restaurant_cannot_be_added(
    restaurant_a, restaurant_b, client: TestClient
):
    """The Cappadocia headers came from copying between restaurants.

    Here the lookup runs inside the menu's own entity context, so an id from
    elsewhere simply is not found.
    """
    menu = _menu(client, restaurant_a.id)
    theirs = _dish(client, restaurant_b.id, "Butter Chicken")
    resp = _set_lines(client, restaurant_a.id, menu["id"], [{"dish_id": theirs}])
    assert resp.status_code == 422, resp.text
    assert "does not exist here" in resp.json()["detail"]


def test_an_unknown_dish_is_refused(restaurant_a, client: TestClient):
    menu = _menu(client, restaurant_a.id)
    resp = _set_lines(
        client, restaurant_a.id, menu["id"], [{"dish_id": str(uuid.uuid4())}]
    )
    assert resp.status_code == 422, resp.text


def test_the_list_sends_a_count_not_the_dishes(restaurant_a, client: TestClient):
    """Eleven menus of ten lines is a lot of payload for a table showing a number."""
    menu = _menu(client, restaurant_a.id)
    dal = _dish(client, restaurant_a.id, "Dal Tadka")
    rice = _dish(client, restaurant_a.id, "White Rice")
    _set_lines(client, restaurant_a.id, menu["id"], [{"dish_id": dal}, {"dish_id": rice}])

    listed = client.get(f"/entities/{restaurant_a.id}/group-menus").json()
    row = listed["items"][0]
    assert row["line_count"] == 2
    assert row["lines"] == []


def test_menus_come_back_in_document_order(restaurant_a, client: TestClient):
    """Alphabetical would put Catering first and Veg Menu 1 in the middle."""
    _menu(client, restaurant_a.id, name="Catering Menu 1", sort_order=90)
    _menu(client, restaurant_a.id, name="Veg Menu 1", sort_order=10)
    _menu(client, restaurant_a.id, name="Non-Veg Menu 1", sort_order=50)

    listed = client.get(f"/entities/{restaurant_a.id}/group-menus").json()
    assert [m["name"] for m in listed["items"]] == [
        "Veg Menu 1",
        "Non-Veg Menu 1",
        "Catering Menu 1",
    ]


def test_an_unknown_menu_is_404(restaurant_a, client: TestClient):
    resp = client.get(f"/entities/{restaurant_a.id}/group-menus/{uuid.uuid4()}")
    assert resp.status_code == 404, resp.text
