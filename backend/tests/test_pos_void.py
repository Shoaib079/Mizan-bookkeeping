"""Void POS daily summaries + settlements (audit C1 / phase 5, F3 policy 2026-07-10)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.models import Account
from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.pos.models import CardSalesBatch, PosDailySummary

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "pos"
SAMPLE_SUMMARY = FIXTURES / "sample_summary.txt"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _cash_account(db_session, entity_id):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )


def _bank_account(db_session, entity_id):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )


@pytest.fixture
def pos_void_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = _cash_account(db_session, restaurant_a.id)
    bank = _bank_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "bank": bank,
        "accounts": accounts,
    }


def _post_sample_summary(client, setup) -> dict:
    entity_id = setup["entity_id"]
    drawer = setup["drawer"]
    upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={"file": ("summary.txt", SAMPLE_SUMMARY.read_bytes(), "text/plain")},
    )
    assert upload.status_code == 201
    summary_id = upload.json()["id"]
    confirm = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary_id}/confirm",
        json={
            "money_account_id": str(drawer.id),
            "actor_id": str(ACTOR_ID),
            "summary_date": "2026-06-22",
        },
    )
    assert confirm.status_code == 200
    return confirm.json()


def _journal_status(db_session, entity_id, journal_entry_id) -> JournalEntryStatus:
    with entity_context(db_session, entity_id):
        entry = db_session.get(JournalEntry, uuid.UUID(str(journal_entry_id)))
        assert entry is not None
        return entry.status


def test_void_posted_daily_summary_reverses_both_journal_entries(
    db_session, client, pos_void_setup
) -> None:
    entity_id = pos_void_setup["entity_id"]
    summary = _post_sample_summary(client, pos_void_setup)
    assert summary["status"] == "posted"

    resp = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary['id']}/void",
        json={"actor_id": str(ACTOR_ID), "reason": "wrong day photographed"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["original_journal_entry_id"]
    assert body["reversal_journal_entry_id"]

    with entity_context(db_session, entity_id):
        row = db_session.get(PosDailySummary, uuid.UUID(summary["id"]))
        assert row is not None
        db_session.refresh(row)
        assert row.status == "voided"
        # Both spawned journal entries voided.
        batch = db_session.get(CardSalesBatch, row.card_sales_batch_id)
        assert batch is not None
        batch_entry = db_session.get(JournalEntry, batch.journal_entry_id)
        assert batch_entry is not None and batch_entry.status == JournalEntryStatus.VOIDED


def test_voided_date_can_be_posted_again(db_session, client, pos_void_setup) -> None:
    entity_id = pos_void_setup["entity_id"]
    summary = _post_sample_summary(client, pos_void_setup)

    void = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary['id']}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert void.status_code == 200

    # The partial unique index only covers status='posted' — a fresh manual
    # posting for the same date must now succeed.
    manual = client.post(
        f"/entities/{entity_id}/pos/manual-daily-sales",
        json={
            "sales_date": summary["summary_date"],
            "cash_kurus": 100_00,
            "card_kurus": 200_00,
            "money_account_id": str(pos_void_setup["drawer"].id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert manual.status_code == 201, manual.text
    assert manual.json()["status"] == "posted"


def test_void_rejected_for_non_posted_summary(client, pos_void_setup) -> None:
    entity_id = pos_void_setup["entity_id"]
    upload = client.post(
        f"/entities/{entity_id}/pos/daily-summaries",
        files={"file": ("summary.txt", SAMPLE_SUMMARY.read_bytes(), "text/plain")},
    )
    assert upload.status_code == 201
    draft_id = upload.json()["id"]

    resp = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{draft_id}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert resp.status_code == 409


def test_void_summary_blocked_when_day_already_settled(
    db_session, client, pos_void_setup
) -> None:
    entity_id = pos_void_setup["entity_id"]
    bank = pos_void_setup["bank"]
    summary = _post_sample_summary(client, pos_void_setup)

    with entity_context(db_session, entity_id):
        row = db_session.get(PosDailySummary, uuid.UUID(summary["id"]))
        batch_id = row.card_sales_batch_id
        assert batch_id is not None
        card_total = row.card_kurus

    settle = client.post(
        f"/entities/{entity_id}/pos/settlements",
        json={
            "money_account_id": str(bank.id),
            "settlement_date": summary["summary_date"],
            "amount_kurus": card_total,
            "description": "POS payout",
            "actor_id": str(ACTOR_ID),
            "card_sales_batch_id": str(batch_id),
        },
    )
    assert settle.status_code == 201, settle.text
    settlement_id = settle.json()["id"]

    blocked = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary['id']}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert blocked.status_code == 409
    assert "settle" in blocked.json()["detail"].lower()

    # Void the settlement, then the day voids cleanly.
    void_settlement = client.post(
        f"/entities/{entity_id}/pos/settlements/{settlement_id}/void",
        json={"actor_id": str(ACTOR_ID), "reason": "bank matched wrong day"},
    )
    assert void_settlement.status_code == 200, void_settlement.text

    unblocked = client.post(
        f"/entities/{entity_id}/pos/daily-summaries/{summary['id']}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert unblocked.status_code == 200, unblocked.text


def test_void_settlement_marks_status_and_is_idempotent_guarded(
    db_session, client, pos_void_setup
) -> None:
    entity_id = pos_void_setup["entity_id"]
    bank = pos_void_setup["bank"]
    summary = _post_sample_summary(client, pos_void_setup)

    with entity_context(db_session, entity_id):
        row = db_session.get(PosDailySummary, uuid.UUID(summary["id"]))
        batch_id = row.card_sales_batch_id
        card_total = row.card_kurus

    settle = client.post(
        f"/entities/{entity_id}/pos/settlements",
        json={
            "money_account_id": str(bank.id),
            "settlement_date": summary["summary_date"],
            "amount_kurus": card_total,
            "description": "POS payout",
            "actor_id": str(ACTOR_ID),
            "card_sales_batch_id": str(batch_id),
        },
    )
    assert settle.status_code == 201
    settlement = settle.json()
    assert settlement.get("status", "posted") == "posted"

    void = client.post(
        f"/entities/{entity_id}/pos/settlements/{settlement['id']}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert void.status_code == 200
    assert (
        _journal_status(db_session, entity_id, settlement["journal_entry_id"])
        == JournalEntryStatus.VOIDED
    )

    listed = client.get(f"/entities/{entity_id}/pos/settlements")
    assert listed.status_code == 200
    match = next(
        item for item in listed.json()["items"] if item["id"] == settlement["id"]
    )
    assert match["status"] == "voided"

    again = client.post(
        f"/entities/{entity_id}/pos/settlements/{settlement['id']}/void",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert again.status_code == 409
