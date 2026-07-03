"""Entity company profile — VKN required on create, editable via PATCH."""

from fastapi.testclient import TestClient

from tests.conftest import entity_create_json


def test_create_entity_requires_vkn(client: TestClient) -> None:
    response = client.post("/entities", json={"name": "No VKN Cafe"})
    assert response.status_code == 422


SAMPLE_VKN = "1234567890"


def test_create_entity_stores_vkn(client: TestClient) -> None:
    response = client.post(
        "/entities",
        json=entity_create_json("VKN Cafe", vkn=SAMPLE_VKN),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["vkn"] == SAMPLE_VKN


def test_patch_entity_updates_company_profile(
    client: TestClient,
    restaurant_a,
) -> None:
    patch = client.patch(
        f"/entities/{restaurant_a.id}",
        json={
            "name": "Demo Kadıköy",
            "legal_name": "DEMO RESTORAN LTD",
            "vkn": SAMPLE_VKN,
        },
    )
    assert patch.status_code == 200
    body = patch.json()
    assert body["name"] == "Demo Kadıköy"
    assert body["legal_name"] == "DEMO RESTORAN LTD"
    assert body["vkn"] == SAMPLE_VKN

    get_resp = client.get(f"/entities/{restaurant_a.id}")
    assert get_resp.json()["vkn"] == SAMPLE_VKN


def test_patch_entity_rejects_invalid_vkn(client: TestClient, restaurant_a) -> None:
    response = client.patch(
        f"/entities/{restaurant_a.id}",
        json={"vkn": "123"},
    )
    assert response.status_code == 422


def test_patch_entity_requires_at_least_one_field(
    client: TestClient,
    restaurant_a,
) -> None:
    response = client.patch(f"/entities/{restaurant_a.id}", json={})
    assert response.status_code == 422
