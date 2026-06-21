"""Manual journal entries — source typing, list/get, void (Phase 1)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.ledger.posting import PostingLine, post_journal_entry
from app.db.session import entity_context


@pytest.fixture
def actor_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        from app.core.chart_of_accounts.models import Account

        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _manual_journal_payload(bank_id, ap_id, actor_id, description="Manual adjustment") -> dict:
    return {
        "entry_date": "2026-01-15",
        "description": description,
        "actor_id": str(actor_id),
        "lines": [
            {"account_id": str(bank_id), "amount_kurus": 50000, "side": "debit"},
            {"account_id": str(ap_id), "amount_kurus": 50000, "side": "credit"},
        ],
    }


def test_create_manual_journal_source_manual(
    client: TestClient, restaurant_a, seeded_accounts, actor_id
) -> None:
    response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json=_manual_journal_payload(
            seeded_accounts["1100"], seeded_accounts["2000"], actor_id
        ),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["source"] == "manual"
    assert body["status"] == "posted"
    assert len(body["lines"]) == 2
    assert body["lines"][0]["account_code"] in {"1100", "2000"}


def test_list_returns_only_manual_entries(
    db_session,
    client: TestClient,
    restaurant_a,
    seeded_accounts,
    actor_id,
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]

    post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "System entry",
        [
            PostingLine(bank_id, 100_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 100_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.SYSTEM,
    )

    client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json=_manual_journal_payload(bank_id, ap_id, actor_id, "Visible manual"),
    )

    list_response = client.get(f"/entities/{restaurant_a.id}/manual-journals")
    assert list_response.status_code == 200
    body = list_response.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["source"] == "manual"
    assert body["items"][0]["description"] == "Visible manual"


def test_list_filters_status_and_date_range(
    client: TestClient, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]

    create_response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json=_manual_journal_payload(bank_id, ap_id, actor_id),
    )
    entry_id = create_response.json()["id"]

    posted_only = client.get(
        f"/entities/{restaurant_a.id}/manual-journals",
        params={"status": "posted"},
    )
    assert posted_only.json()["total"] == 1

    client.post(
        f"/entities/{restaurant_a.id}/manual-journals/{entry_id}/void",
        json={"actor_id": str(actor_id), "reason": "Test"},
    )

    voided_only = client.get(
        f"/entities/{restaurant_a.id}/manual-journals",
        params={"status": "voided"},
    )
    assert voided_only.json()["total"] == 1
    assert voided_only.json()["items"][0]["status"] == "voided"

    out_of_range = client.get(
        f"/entities/{restaurant_a.id}/manual-journals",
        params={"from": "2026-02-01", "to": "2026-02-28"},
    )
    assert out_of_range.json()["total"] == 0


def test_get_manual_journal_with_lines(
    client: TestClient, restaurant_a, seeded_accounts, actor_id
) -> None:
    create_response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json=_manual_journal_payload(
            seeded_accounts["1100"], seeded_accounts["2000"], actor_id
        ),
    )
    entry_id = create_response.json()["id"]

    get_response = client.get(
        f"/entities/{restaurant_a.id}/manual-journals/{entry_id}"
    )
    assert get_response.status_code == 200
    body = get_response.json()
    assert body["id"] == entry_id
    assert len(body["lines"]) == 2
    assert all(line["account_name_en"] for line in body["lines"])


def test_cross_entity_get_and_list_are_empty_or_not_found(
    client: TestClient,
    restaurant_a,
    restaurant_b,
    seeded_accounts,
    actor_id,
) -> None:
    create_response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json=_manual_journal_payload(
            seeded_accounts["1100"], seeded_accounts["2000"], actor_id
        ),
    )
    entry_id = create_response.json()["id"]

    get_on_b = client.get(f"/entities/{restaurant_b.id}/manual-journals/{entry_id}")
    assert get_on_b.status_code == 404

    list_on_b = client.get(f"/entities/{restaurant_b.id}/manual-journals")
    assert list_on_b.status_code == 200
    assert list_on_b.json()["total"] == 0


def test_void_manual_journal(
    client: TestClient, restaurant_a, seeded_accounts, actor_id
) -> None:
    create_response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json=_manual_journal_payload(
            seeded_accounts["1100"], seeded_accounts["2000"], actor_id
        ),
    )
    entry_id = create_response.json()["id"]

    void_response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals/{entry_id}/void",
        json={"actor_id": str(actor_id), "reason": "Correction"},
    )
    assert void_response.status_code == 200
    body = void_response.json()
    assert body["original"]["status"] == "voided"
    assert body["original"]["source"] == "manual"
    assert body["reversal"]["source"] == "system"
    assert body["reversal"]["reverses_entry_id"] == entry_id


def test_get_non_manual_entry_returns_404(
    db_session,
    client: TestClient,
    restaurant_a,
    seeded_accounts,
    actor_id,
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    system_entry = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Not manual",
        [
            PostingLine(bank_id, 100_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 100_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.INVOICE,
    )

    response = client.get(
        f"/entities/{restaurant_a.id}/manual-journals/{system_entry.id}"
    )
    assert response.status_code == 404
