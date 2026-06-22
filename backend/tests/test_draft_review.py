"""Invoice draft review / confirm workflow (Phase 2 slice 2)."""

from __future__ import annotations

import uuid
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"
SAMPLE_XML = FIXTURES / "sample.xml"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _upload(client, entity_id):
    return client.post(
        f"/entities/{entity_id}/invoices/efatura/draft",
        files={"file": ("sample.xml", SAMPLE_XML.read_bytes(), "application/xml")},
    )


def _linked_draft(client, entity_id):
    client.post(
        f"/entities/{entity_id}/suppliers",
        json={"name": "Metro Gida", "vkn": "1234567890"},
    )
    upload = _upload(client, entity_id)
    assert upload.status_code == 201
    return upload.json()


def test_confirm_requires_supplier(client, restaurant_a) -> None:
    upload = _upload(client, restaurant_a.id)
    draft_id = upload.json()["id"]

    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert response.status_code == 422
    assert "Supplier must be linked" in response.json()["detail"]


def test_confirm_draft_with_supplier(client, restaurant_a) -> None:
    draft = _linked_draft(client, restaurant_a.id)
    draft_id = draft["id"]

    confirm = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert confirm.status_code == 200
    body = confirm.json()
    assert body["status"] == "confirmed"
    assert body["confirmed_by"] == str(ACTOR_ID)
    assert body["confirmed_at"] is not None


def test_confirmed_draft_immutable(client, restaurant_a) -> None:
    draft = _linked_draft(client, restaurant_a.id)
    draft_id = draft["id"]

    confirm = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert confirm.status_code == 200

    unlink = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/unlink-supplier"
    )
    assert unlink.status_code == 409

    link = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/link-supplier",
        json={},
    )
    assert link.status_code == 409

    reject = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/reject",
        json={"reason": "Too late"},
    )
    assert reject.status_code == 409


def test_reject_marks_needs_review(client, restaurant_a) -> None:
    upload = _upload(client, restaurant_a.id)
    draft_id = upload.json()["id"]

    reject = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/reject",
        json={"reason": "Totals look wrong"},
    )
    assert reject.status_code == 200
    body = reject.json()
    assert body["status"] == "needs_review"
    assert body["review_reason"] == "Totals look wrong"


def test_confirm_from_needs_review(client, restaurant_a) -> None:
    draft = _linked_draft(client, restaurant_a.id)
    draft_id = draft["id"]

    reject = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/reject",
        json={"reason": "Check VAT"},
    )
    assert reject.status_code == 200

    confirm = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert confirm.status_code == 200
    assert confirm.json()["status"] == "confirmed"


def test_list_drafts_filter_by_status(client, restaurant_a) -> None:
    draft = _linked_draft(client, restaurant_a.id)
    draft_id = draft["id"]

    client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )

    all_drafts = client.get(f"/entities/{restaurant_a.id}/invoices/drafts")
    assert all_drafts.json()["total"] == 1

    confirmed = client.get(
        f"/entities/{restaurant_a.id}/invoices/drafts",
        params={"status": "confirmed"},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["total"] == 1
    assert confirmed.json()["items"][0]["status"] == "confirmed"

    draft_only = client.get(
        f"/entities/{restaurant_a.id}/invoices/drafts",
        params={"status": "draft"},
    )
    assert draft_only.json()["total"] == 0
