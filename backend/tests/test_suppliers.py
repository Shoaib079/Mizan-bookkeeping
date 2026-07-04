"""Supplier master — per-entity registry, VKN uniqueness, RLS isolation (Phase 2)."""

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.db.session import entity_context
from app.features.suppliers import service
from app.features.suppliers.models import Supplier
from app.features.suppliers.schema import SupplierCreate, SupplierUpdate, validate_vkn


def _payload(**overrides) -> SupplierCreate:
    base = {
        "name": "Anadolu Et Tedarik",
        "vkn": "1234567890",
        "iban": "TR330006100519786457841326",
        "notes": "Primary meat vendor",
    }
    base.update(overrides)
    return SupplierCreate(**base)


def test_create_supplier_succeeds(db_session, restaurant_a) -> None:
    supplier = service.create_supplier(db_session, restaurant_a.id, _payload())
    assert supplier.id is not None
    assert supplier.entity_id == restaurant_a.id
    assert supplier.name == "Anadolu Et Tedarik"
    assert supplier.vkn == "1234567890"
    assert supplier.is_active is True


def test_duplicate_vkn_same_entity_rejected(db_session, restaurant_a) -> None:
    service.create_supplier(db_session, restaurant_a.id, _payload())
    with pytest.raises(service.DuplicateSupplierError):
        service.create_supplier(db_session, restaurant_a.id, _payload(name="Other Name"))


def test_same_vkn_different_entities_allowed(
    db_session, restaurant_a, restaurant_b
) -> None:
    payload = _payload()
    a = service.create_supplier(db_session, restaurant_a.id, payload)
    a_entity_id = a.entity_id
    a_vkn = a.vkn
    b = service.create_supplier(db_session, restaurant_b.id, payload)
    assert payload.vkn == a_vkn == b.vkn
    assert a_entity_id != b.entity_id


def test_list_suppliers_ordered_by_name(db_session, restaurant_a) -> None:
    service.create_supplier(
        db_session, restaurant_a.id, _payload(name="Zebra Foods", vkn="1111111111")
    )
    service.create_supplier(
        db_session, restaurant_a.id, _payload(name="Alpha Produce", vkn="2222222222")
    )
    suppliers, _ = service.list_suppliers(db_session, restaurant_a.id)
    names = [s.name for s in suppliers]
    assert names == ["Alpha Produce", "Zebra Foods"]


def test_list_excludes_inactive_by_default(db_session, restaurant_a) -> None:
    active = service.create_supplier(
        db_session, restaurant_a.id, _payload(name="Active Co", vkn="3333333333")
    )
    inactive = service.create_supplier(
        db_session, restaurant_a.id, _payload(name="Inactive Co", vkn="4444444444")
    )
    service.update_supplier(
        db_session,
        restaurant_a.id,
        inactive.id,
        SupplierUpdate(is_active=False),
    )

    visible, _ = service.list_suppliers(db_session, restaurant_a.id)
    assert [s.id for s in visible] == [active.id]

    all_suppliers, _ = service.list_suppliers(
        db_session, restaurant_a.id, include_inactive=True
    )
    assert len(all_suppliers) == 2


def test_get_supplier(db_session, restaurant_a) -> None:
    created = service.create_supplier(db_session, restaurant_a.id, _payload())
    fetched = service.get_supplier(db_session, restaurant_a.id, created.id)
    assert fetched.id == created.id


def test_update_supplier(db_session, restaurant_a) -> None:
    created = service.create_supplier(db_session, restaurant_a.id, _payload())
    updated = service.update_supplier(
        db_session,
        restaurant_a.id,
        created.id,
        SupplierUpdate(name="Updated Name", notes="New notes", is_active=False),
    )
    assert updated.name == "Updated Name"
    assert updated.notes == "New notes"
    assert updated.is_active is False
    assert updated.vkn == "1234567890"


def test_find_by_vkn(db_session, restaurant_a) -> None:
    created = service.create_supplier(db_session, restaurant_a.id, _payload())
    found = service.find_by_vkn(db_session, restaurant_a.id, "1234567890")
    assert found is not None
    assert found.id == created.id

    missing = service.find_by_vkn(db_session, restaurant_a.id, "9999999999")
    assert missing is None


def test_find_or_create_supplier_for_efatura_creates(db_session, restaurant_a) -> None:
    supplier = service.find_or_create_supplier_for_efatura(
        db_session,
        restaurant_a.id,
        supplier_vkn="5555555555",
        supplier_name="Metro Wholesale",
    )
    assert supplier is not None
    assert supplier.vkn == "5555555555"
    assert supplier.name == "Metro Wholesale"
    assert supplier.notes == "Auto-created from e-Fatura upload"


def test_find_or_create_supplier_for_efatura_reuses_existing(
    db_session, restaurant_a
) -> None:
    existing = service.create_supplier(db_session, restaurant_a.id, _payload())
    supplier = service.find_or_create_supplier_for_efatura(
        db_session,
        restaurant_a.id,
        supplier_vkn="1234567890",
        supplier_name="Different Name On PDF",
    )
    assert supplier is not None
    assert supplier.id == existing.id
    assert supplier.name == existing.name


def test_find_or_create_supplier_skips_entity_buyer_vkn(
    db_session, restaurant_a
) -> None:
    restaurant_a.vkn = "1234567890"
    db_session.commit()

    supplier = service.find_or_create_supplier_for_efatura(
        db_session,
        restaurant_a.id,
        supplier_vkn="1234567890",
        supplier_name="Should Not Create",
        entity_vkn=restaurant_a.vkn,
    )
    assert supplier is None


def test_find_or_create_supplier_rejects_buyer_name_fragment(
    db_session, restaurant_a
) -> None:
    supplier = service.find_or_create_supplier_for_efatura(
        db_session,
        restaurant_a.id,
        supplier_vkn="8590491872",
        supplier_name="TİCARET LİMİTED ŞİRKETİ",
        entity_legal_name="REMBETİKO TURİZM RESTORAN İŞLETMECİLİĞİ SANAYİ VE TİCARET LİMİTED ŞİRKETİ",
    )
    assert supplier is not None
    assert supplier.vkn == "8590491872"
    assert supplier.name == "Supplier 8590491872"
    assert "TİCARET LİMİTED" not in supplier.name


def test_invalid_vkn_format_rejected() -> None:
    with pytest.raises(ValueError, match="10 or 11 digits"):
        validate_vkn("12345")
    with pytest.raises(ValueError, match="10 or 11 digits"):
        validate_vkn("123456789a")
    with pytest.raises(ValueError, match="10 or 11 digits"):
        validate_vkn("123456789012")


def test_entity_b_cannot_see_entity_a_suppliers(
    db_session, restaurant_a, restaurant_b
) -> None:
    service.create_supplier(db_session, restaurant_a.id, _payload())

    with entity_context(db_session, restaurant_b.id):
        visible = list(db_session.scalars(select(Supplier)))
        assert visible == []

    with entity_context(db_session, restaurant_b.id):
        rows = db_session.execute(
            text("SELECT vkn FROM suppliers WHERE vkn = '1234567890'")
        ).all()
        assert rows == []


def test_api_create_list_get_update(
    client: TestClient, restaurant_a, restaurant_b
) -> None:
    create = client.post(
        f"/entities/{restaurant_a.id}/suppliers",
        json={
            "name": "API Supplier",
            "vkn": "5555555555",
            "iban": "TR123",
            "notes": "via api",
        },
    )
    assert create.status_code == 201
    body = create.json()
    supplier_id = body["id"]
    assert body["vkn"] == "5555555555"

    listing = client.get(f"/entities/{restaurant_a.id}/suppliers")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    detail = client.get(f"/entities/{restaurant_a.id}/suppliers/{supplier_id}")
    assert detail.status_code == 200
    assert detail.json()["name"] == "API Supplier"

    by_vkn = client.get(
        f"/entities/{restaurant_a.id}/suppliers/by-vkn/5555555555"
    )
    assert by_vkn.status_code == 200
    assert by_vkn.json()["id"] == supplier_id

    patch = client.patch(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}",
        json={"name": "Renamed", "is_active": False},
    )
    assert patch.status_code == 200
    assert patch.json()["name"] == "Renamed"
    assert patch.json()["is_active"] is False

    active_only = client.get(f"/entities/{restaurant_a.id}/suppliers")
    assert active_only.status_code == 200
    assert active_only.json()["items"] == [] and active_only.json()["total"] == 0

    with_inactive = client.get(
        f"/entities/{restaurant_a.id}/suppliers?include_inactive=true"
    )
    assert with_inactive.status_code == 200
    assert with_inactive.json()["total"] == 1

    list_b = client.get(f"/entities/{restaurant_b.id}/suppliers")
    assert list_b.status_code == 200
    assert list_b.json()["items"] == [] and list_b.json()["total"] == 0


def test_api_duplicate_vkn_returns_409(client: TestClient, restaurant_a) -> None:
    payload = {"name": "First", "vkn": "6666666666"}
    assert client.post(f"/entities/{restaurant_a.id}/suppliers", json=payload).status_code == 201
    dup = client.post(f"/entities/{restaurant_a.id}/suppliers", json=payload)
    assert dup.status_code == 409


def test_api_invalid_vkn_returns_422(client: TestClient, restaurant_a) -> None:
    response = client.post(
        f"/entities/{restaurant_a.id}/suppliers",
        json={"name": "Bad VKN", "vkn": "123"},
    )
    assert response.status_code == 422

    lookup = client.get(f"/entities/{restaurant_a.id}/suppliers/by-vkn/bad")
    assert lookup.status_code == 422


def test_api_unknown_entity_returns_404(client: TestClient) -> None:
    entity_id = uuid.uuid4()
    response = client.post(
        f"/entities/{entity_id}/suppliers",
        json={"name": "X", "vkn": "7777777777"},
    )
    assert response.status_code == 404


def test_api_get_by_vkn_not_found(client: TestClient, restaurant_a) -> None:
    response = client.get(
        f"/entities/{restaurant_a.id}/suppliers/by-vkn/8888888888"
    )
    assert response.status_code == 404
