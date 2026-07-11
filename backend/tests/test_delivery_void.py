"""Void delivery reports + settlements (audit C1 / phase 5, F3 policy 2026-07-10)."""

from __future__ import annotations

import uuid

import pytest

from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.db.session import entity_context
from app.features.delivery.models import DeliveryReport
from tests.delivery_helpers import delivery_setup as build_delivery_setup

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def void_setup(db_session, restaurant_a):
    return build_delivery_setup(db_session, restaurant_a.id)


def _post_report(client, setup, *, period=("2026-05-01", "2026-05-31")) -> dict:
    entity_id = setup["entity_id"]
    getir = setup["platforms"]["Getir"]
    created = client.post(
        f"/entities/{entity_id}/delivery/reports",
        json={
            "delivery_platform_id": str(getir.id),
            "period_start": period[0],
            "period_end": period[1],
            "gross_kurus": 250_000,
            "description": "Monthly delivery sales",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert created.status_code == 201, created.text
    report_id = created.json()["id"]
    posted = client.post(
        f"/entities/{entity_id}/delivery/reports/{report_id}/post",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert posted.status_code == 200, posted.text
    return posted.json()


def _create_settlement(client, setup, *, report_id: str | None = None) -> dict:
    entity_id = setup["entity_id"]
    getir = setup["platforms"]["Getir"]
    bank = setup["bank"]
    payload = {
        "delivery_platform_id": str(getir.id),
        "money_account_id": str(bank.id),
        "settlement_date": "2026-05-15",
        "amount_kurus": 225_000,
        "description": "Getir payout",
        "actor_id": str(ACTOR_ID),
    }
    if report_id is not None:
        payload["delivery_report_id"] = report_id
    resp = client.post(f"/entities/{entity_id}/delivery/settlements", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _journal_status(db_session, entity_id, journal_entry_id) -> JournalEntryStatus:
    with entity_context(db_session, entity_id):
        entry = db_session.get(JournalEntry, uuid.UUID(str(journal_entry_id)))
        assert entry is not None
        return entry.status


def test_void_posted_report_reverses_entry_and_frees_period(
    db_session, client, void_setup
) -> None:
    entity_id = void_setup["entity_id"]
    report = _post_report(client, void_setup)

    resp = client.post(
        f"/entities/{entity_id}/delivery/reports/{report['id']}/void",
        json={"actor_id": str(ACTOR_ID), "reason": "duplicate upload"},
    )
    assert resp.status_code == 200, resp.text
    assert (
        _journal_status(db_session, entity_id, report["journal_entry_id"])
        == JournalEntryStatus.VOIDED
    )

    with entity_context(db_session, entity_id):
        row = db_session.get(DeliveryReport, uuid.UUID(report["id"]))
        db_session.refresh(row)
        assert row.status == "voided"

    # The posted-per-period unique index only covers status='posted' — the
    # same platform+period can be posted again after the void.
    reposted = _post_report(client, void_setup)
    assert reposted["status"] == "posted"


def test_void_report_blocked_while_live_settlement_references_it(
    db_session, client, void_setup
) -> None:
    entity_id = void_setup["entity_id"]
    report = _post_report(client, void_setup)
    settlement = _create_settlement(client, void_setup, report_id=report["id"])

    blocked = client.post(
        f"/entities/{entity_id}/delivery/reports/{report['id']}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert blocked.status_code == 409
    assert "settlement" in blocked.json()["detail"].lower()

    void_settlement = client.post(
        f"/entities/{entity_id}/delivery/settlements/{settlement['id']}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert void_settlement.status_code == 200, void_settlement.text

    unblocked = client.post(
        f"/entities/{entity_id}/delivery/reports/{report['id']}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert unblocked.status_code == 200, unblocked.text


def test_void_report_rejected_for_non_posted(client, void_setup) -> None:
    entity_id = void_setup["entity_id"]
    getir = void_setup["platforms"]["Getir"]
    created = client.post(
        f"/entities/{entity_id}/delivery/reports",
        json={
            "delivery_platform_id": str(getir.id),
            "period_start": "2026-06-01",
            "period_end": "2026-06-30",
            "gross_kurus": 100_000,
            "description": "Draft report",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert created.status_code == 201

    resp = client.post(
        f"/entities/{entity_id}/delivery/reports/{created.json()['id']}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert resp.status_code == 409


def test_void_settlement_marks_status_and_double_void_conflicts(
    db_session, client, void_setup
) -> None:
    entity_id = void_setup["entity_id"]
    settlement = _create_settlement(client, void_setup)
    assert settlement.get("status", "posted") == "posted"

    resp = client.post(
        f"/entities/{entity_id}/delivery/settlements/{settlement['id']}/void",
        json={"actor_id": str(ACTOR_ID), "reason": "matched wrong platform"},
    )
    assert resp.status_code == 200, resp.text
    assert (
        _journal_status(db_session, entity_id, settlement["journal_entry_id"])
        == JournalEntryStatus.VOIDED
    )

    listed = client.get(f"/entities/{entity_id}/delivery/settlements")
    assert listed.status_code == 200
    match = next(
        item for item in listed.json()["items"] if item["id"] == settlement["id"]
    )
    assert match["status"] == "voided"

    again = client.post(
        f"/entities/{entity_id}/delivery/settlements/{settlement['id']}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert again.status_code == 409


def test_void_missing_ids_return_404(client, void_setup) -> None:
    entity_id = void_setup["entity_id"]
    missing = uuid.uuid4()
    assert (
        client.post(
            f"/entities/{entity_id}/delivery/reports/{missing}/void",
            json={"actor_id": str(ACTOR_ID)},
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/entities/{entity_id}/delivery/settlements/{missing}/void",
            json={"actor_id": str(ACTOR_ID)},
        ).status_code
        == 404
    )
