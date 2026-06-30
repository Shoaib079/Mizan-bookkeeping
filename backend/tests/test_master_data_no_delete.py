"""Master directories are deactivate-only — never hard-delete (Decisions §1, CURSOR_RULES §1)."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient


def _create_supplier(client: TestClient, entity_id: uuid.UUID) -> uuid.UUID:
    res = client.post(
        f"/entities/{entity_id}/suppliers",
        json={"name": "No Delete Vendor", "vkn": "7777777777"},
    )
    assert res.status_code == 201
    return uuid.UUID(res.json()["id"])


def _create_customer(client: TestClient, entity_id: uuid.UUID) -> uuid.UUID:
    res = client.post(
        f"/entities/{entity_id}/customers",
        json={"name": "No Delete Customer", "identifier": "cust-no-del"},
    )
    assert res.status_code == 201
    return uuid.UUID(res.json()["id"])


def _create_partner(client: TestClient, entity_id: uuid.UUID) -> uuid.UUID:
    res = client.post(
        f"/entities/{entity_id}/partners",
        json={"name": "No Delete Partner"},
    )
    assert res.status_code == 201
    return uuid.UUID(res.json()["id"])


def _create_employee(client: TestClient, entity_id: uuid.UUID) -> uuid.UUID:
    res = client.post(
        f"/entities/{entity_id}/staff/employees",
        json={"name": "No Delete Staff"},
    )
    assert res.status_code == 201
    return uuid.UUID(res.json()["id"])


@pytest.mark.parametrize(
    ("resource", "factory"),
    [
        ("suppliers", _create_supplier),
        ("customers", _create_customer),
        ("partners", _create_partner),
        ("staff/employees", _create_employee),
    ],
)
def test_master_directory_has_no_delete_route(
    client: TestClient,
    restaurant_a,
    resource: str,
    factory,
) -> None:
    record_id = factory(client, restaurant_a.id)
    response = client.delete(f"/entities/{restaurant_a.id}/{resource}/{record_id}")
    assert response.status_code == 405


def test_deactivated_supplier_still_in_database_and_listable(
    client: TestClient, restaurant_a
) -> None:
    supplier_id = _create_supplier(client, restaurant_a.id)
    patch = client.patch(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}",
        json={"is_active": False},
    )
    assert patch.status_code == 200

    hidden = client.get(f"/entities/{restaurant_a.id}/suppliers?limit=50")
    assert hidden.status_code == 200
    assert hidden.json()["total"] == 0

    visible = client.get(
        f"/entities/{restaurant_a.id}/suppliers?include_inactive=true&limit=50"
    )
    assert visible.status_code == 200
    ids = [row["id"] for row in visible.json()["items"]]
    assert str(supplier_id) in ids

    detail = client.get(f"/entities/{restaurant_a.id}/suppliers/{supplier_id}")
    assert detail.status_code == 200
    assert detail.json()["is_active"] is False
