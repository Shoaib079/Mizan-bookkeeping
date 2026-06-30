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

    # e-Fatura upload auto-links supplier; clear link to exercise confirm gate.
    unlink = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/unlink-supplier"
    )
    assert unlink.status_code == 200

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


def test_confirmed_draft_immutable_until_unconfirm(client, restaurant_a) -> None:
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

    unconfirm = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/unconfirm",
        json={"actor_id": str(ACTOR_ID), "reason": "Wrong supplier"},
    )
    assert unconfirm.status_code == 200
    body = unconfirm.json()
    assert body["status"] == "draft"
    assert body["confirmed_at"] is None
    assert body["confirmed_by"] is None
    assert body["review_reason"] == "Wrong supplier"

    unlink_after = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/unlink-supplier"
    )
    assert unlink_after.status_code == 200


def test_unconfirm_posted_draft_blocked(client, restaurant_a, db_session) -> None:
    draft = _linked_draft(client, restaurant_a.id)
    draft_id = draft["id"]

    client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )

    from app.db.session import entity_context
    from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus

    with entity_context(db_session, restaurant_a.id):
        row = db_session.get(InvoiceDraft, draft_id)
        assert row is not None
        row.status = InvoiceDraftStatus.POSTED.value
        db_session.commit()

    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/unconfirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert response.status_code == 422


def test_reject_confirmed_discards_draft(client, restaurant_a) -> None:
    draft = _linked_draft(client, restaurant_a.id)
    draft_id = draft["id"]
    stored_path = draft["extraction_payload"]["stored_path"]

    client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )

    reject = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/reject",
        json={"reason": "Misclassified"},
    )
    assert reject.status_code == 204
    assert not Path(stored_path).exists()

    gone = client.get(f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}")
    assert gone.status_code == 404


def test_set_kind_supplier_to_commission(client, restaurant_a, db_session) -> None:
    from tests.delivery_helpers import delivery_setup as build_delivery_setup

    build_delivery_setup(db_session, restaurant_a.id, platform_names=("Getir",))
    draft = _linked_draft(client, restaurant_a.id)
    draft_id = draft["id"]
    assert draft["invoice_kind"] == "supplier"

    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/set-kind",
        json={"invoice_kind": "delivery_commission"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["invoice_kind"] == "delivery_commission"
    assert body["status"] == "needs_review"
    assert body["delivery_platform_id"] is None

    back = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/set-kind",
        json={"invoice_kind": "supplier"},
    )
    assert back.status_code == 200
    assert back.json()["invoice_kind"] == "supplier"
    assert back.json()["status"] == "draft"


def test_reject_discards_draft_and_file(client, restaurant_a) -> None:
    upload = _upload(client, restaurant_a.id)
    draft_id = upload.json()["id"]
    stored_path = upload.json()["extraction_payload"]["stored_path"]

    reject = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/reject",
        json={"reason": "Totals look wrong"},
    )
    assert reject.status_code == 204
    assert not Path(stored_path).exists()

    gone = client.get(f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}")
    assert gone.status_code == 404


def test_reject_twice_returns_not_found(client, restaurant_a) -> None:
    upload = _upload(client, restaurant_a.id)
    draft_id = upload.json()["id"]

    first = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/reject",
        json={"reason": "Wrong supplier"},
    )
    assert first.status_code == 204

    second = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/reject",
        json={"reason": "Again"},
    )
    assert second.status_code == 404


def test_confirm_from_needs_review(client, restaurant_a, db_session) -> None:
    draft = _linked_draft(client, restaurant_a.id)
    draft_id = draft["id"]

    from app.db.session import entity_context
    from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus

    with entity_context(db_session, restaurant_a.id):
        row = db_session.get(InvoiceDraft, draft_id)
        assert row is not None
        row.status = InvoiceDraftStatus.NEEDS_REVIEW.value
        row.review_reason = "Check VAT"
        db_session.commit()

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
