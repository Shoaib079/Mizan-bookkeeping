"""Entity settings create + PATCH — Phase 11 Slice 11.2."""

from fastapi.testclient import TestClient

from app.features.entities import service
from app.features.entities.schema import EntitySettingCreate


def test_create_entity_setting(client: TestClient, restaurant_a) -> None:
    response = client.post(
        f"/entities/{restaurant_a.id}/settings",
        json={"key": "delivery_enabled", "value": "true"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["key"] == "delivery_enabled"
    assert body["value"] == "true"
    assert body["entity_id"] == str(restaurant_a.id)


def test_duplicate_create_returns_409(client: TestClient, restaurant_a) -> None:
    payload = {"key": "delivery_enabled", "value": "true"}
    first = client.post(f"/entities/{restaurant_a.id}/settings", json=payload)
    assert first.status_code == 201
    dup = client.post(f"/entities/{restaurant_a.id}/settings", json=payload)
    assert dup.status_code == 409


def test_patch_updates_setting_value(client: TestClient, restaurant_a) -> None:
    create = client.post(
        f"/entities/{restaurant_a.id}/settings",
        json={"key": "delivery_enabled", "value": "true"},
    )
    assert create.status_code == 201

    patch = client.patch(
        f"/entities/{restaurant_a.id}/settings/delivery_enabled",
        json={"value": "false"},
    )
    assert patch.status_code == 200
    assert patch.json()["value"] == "false"

    listing = client.get(f"/entities/{restaurant_a.id}/settings")
    assert listing.status_code == 200
    items = listing.json()["items"]
    assert len(items) == 1
    assert items[0]["value"] == "false"


def test_patch_missing_setting_returns_404(client: TestClient, restaurant_a) -> None:
    response = client.patch(
        f"/entities/{restaurant_a.id}/settings/delivery_enabled",
        json={"value": "true"},
    )
    assert response.status_code == 404


def test_patch_missing_entity_returns_404(client: TestClient) -> None:
    missing_id = "00000000-0000-0000-0000-000000000099"
    response = client.patch(
        f"/entities/{missing_id}/settings/delivery_enabled",
        json={"value": "true"},
    )
    assert response.status_code == 404


def test_patch_entity_isolation(
    client: TestClient, restaurant_a, restaurant_b, db_session
) -> None:
    service.create_entity_setting(
        db_session,
        restaurant_a.id,
        EntitySettingCreate(key="delivery_enabled", value="true"),
    )

    patch_b = client.patch(
        f"/entities/{restaurant_b.id}/settings/delivery_enabled",
        json={"value": "false"},
    )
    assert patch_b.status_code == 404

    list_a = client.get(f"/entities/{restaurant_a.id}/settings")
    assert list_a.json()["items"][0]["value"] == "true"
