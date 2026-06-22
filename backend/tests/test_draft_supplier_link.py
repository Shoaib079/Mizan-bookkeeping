"""Invoice draft → supplier linking (Phase 2 slice 1)."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest

from app.features.suppliers.schema import SupplierCreate

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"
SAMPLE_XML = FIXTURES / "sample.xml"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _upload_draft(client, entity_id, *, content=None):
    content = content or SAMPLE_XML.read_bytes()
    return client.post(
        f"/entities/{entity_id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )


def _create_supplier(client, entity_id, *, name="Metro Gida", vkn="1234567890"):
    return client.post(
        f"/entities/{entity_id}/suppliers",
        json={"name": name, "vkn": vkn},
    )


def test_auto_link_on_upload_when_vkn_matches(
    client, restaurant_a
) -> None:
    supplier = _create_supplier(client, restaurant_a.id)
    assert supplier.status_code == 201

    upload = _upload_draft(client, restaurant_a.id)
    assert upload.status_code == 201
    body = upload.json()
    assert body["supplier_id"] == supplier.json()["id"]
    assert body["linked_supplier_name"] == "Metro Gida"
    assert body["linked_supplier_vkn"] == "1234567890"
    assert body["supplier_vkn"] == "1234567890"


def test_no_auto_link_when_vkn_unknown(client, restaurant_a) -> None:
    upload = _upload_draft(client, restaurant_a.id)
    assert upload.status_code == 201
    body = upload.json()
    assert body["supplier_id"] is None
    assert body["linked_supplier_name"] is None


def test_manual_link_supplier(client, restaurant_a) -> None:
    upload = _upload_draft(client, restaurant_a.id)
    draft_id = upload.json()["id"]

    supplier = _create_supplier(
        client, restaurant_a.id, name="Manual Vendor", vkn="9999999999"
    )
    assert supplier.status_code == 201
    supplier_id = supplier.json()["id"]

    link = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/link-supplier",
        json={"supplier_id": supplier_id},
    )
    assert link.status_code == 200
    body = link.json()
    assert body["supplier_id"] == supplier_id
    assert body["linked_supplier_name"] == "Manual Vendor"
    assert body["linked_supplier_vkn"] == "9999999999"


def test_auto_link_by_draft_vkn(client, restaurant_a) -> None:
    upload = _upload_draft(client, restaurant_a.id)
    draft_id = upload.json()["id"]
    assert upload.json()["supplier_id"] is None

    supplier = _create_supplier(client, restaurant_a.id)
    assert supplier.status_code == 201

    link = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/link-supplier",
        json={},
    )
    assert link.status_code == 200
    assert link.json()["supplier_id"] == supplier.json()["id"]


def test_unlink_supplier(client, restaurant_a) -> None:
    _create_supplier(client, restaurant_a.id)
    upload = _upload_draft(client, restaurant_a.id)
    draft_id = upload.json()["id"]
    assert upload.json()["supplier_id"] is not None

    unlink = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/unlink-supplier"
    )
    assert unlink.status_code == 200
    assert unlink.json()["supplier_id"] is None
    assert unlink.json()["linked_supplier_name"] is None


def test_link_unknown_supplier_returns_404(
    client, restaurant_a
) -> None:
    upload = _upload_draft(client, restaurant_a.id)
    draft_id = upload.json()["id"]

    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/link-supplier",
        json={"supplier_id": str(uuid.uuid4())},
    )
    assert response.status_code == 404


def test_cross_entity_supplier_link_rejected(
    client, restaurant_a, restaurant_b
) -> None:
    upload = _upload_draft(client, restaurant_a.id)
    draft_id = upload.json()["id"]

    supplier_b = _create_supplier(
        client, restaurant_b.id, name="Entity B Vendor", vkn="8888888888"
    )
    assert supplier_b.status_code == 201

    link = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/link-supplier",
        json={"supplier_id": supplier_b.json()["id"]},
    )
    assert link.status_code == 404


def test_auto_link_no_matching_vkn_returns_404(
    client, restaurant_a
) -> None:
    upload = _upload_draft(client, restaurant_a.id)
    draft_id = upload.json()["id"]

    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/link-supplier",
        json={},
    )
    assert response.status_code == 404
