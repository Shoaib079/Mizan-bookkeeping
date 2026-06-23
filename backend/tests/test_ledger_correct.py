"""Atomic correct/amend operation — Phase 8.5 Slice 2."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import (
    JournalEntry,
    JournalEntryLine,
    JournalEntrySource,
    JournalEntryStatus,
    LedgerAuditAction,
    LedgerAuditEvent,
)
from app.core.ledger.posting import (
    AlreadyVoidedError,
    NotVoidableError,
    PostingLine,
    UnbalancedEntryError,
    correct_journal_entry,
    post_journal_entry,
    void_journal_entry,
)
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


def _net_balance_by_account(db_session, entity_id) -> dict:
    with entity_context(db_session, entity_id):
        query = (
            select(
                JournalEntryLine.account_id,
                JournalEntryLine.side,
                func.sum(JournalEntryLine.amount_kurus),
            )
            .join(JournalEntry)
            .group_by(JournalEntryLine.account_id, JournalEntryLine.side)
        )
        rows = db_session.execute(query).all()
    net: dict = {}
    for account_id, side, total in rows:
        signed = total if side == AccountNormalBalance.DEBIT else -total
        net[account_id] = net.get(account_id, 0) + signed
    return net


def test_correct_changes_amounts_and_links_all_three(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    original = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Original amount",
        [
            PostingLine(bank_id, 500_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 500_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )

    voided, reversal, corrected = correct_journal_entry(
        db_session,
        restaurant_a.id,
        original.id,
        date(2026, 1, 3),
        "Corrected amount",
        [
            PostingLine(bank_id, 700_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 700_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        reason="Wrong amount",
        void_date=date(2026, 1, 2),
    )

    assert voided.status == JournalEntryStatus.VOIDED
    assert voided.reversed_by_entry_id == reversal.id
    assert voided.amended_by_entry_id == corrected.id
    assert reversal.reverses_entry_id == original.id
    assert reversal.status == JournalEntryStatus.POSTED
    assert corrected.status == JournalEntryStatus.POSTED
    assert corrected.amends_entry_id == original.id
    assert corrected.source == JournalEntrySource.MANUAL
    assert corrected.description == "Corrected amount"
    assert corrected.entry_date == date(2026, 1, 3)

    with entity_context(db_session, restaurant_a.id):
        entries = list(db_session.scalars(select(JournalEntry)))
        assert len(entries) == 3

    net = _net_balance_by_account(db_session, restaurant_a.id)
    assert net.get(bank_id, 0) == 700_00
    assert net.get(ap_id, 0) == -700_00


def test_correct_atomicity_invalid_lines_leaves_original_posted(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    original = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Stay posted",
        [
            PostingLine(bank_id, 200_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 200_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )

    with pytest.raises(UnbalancedEntryError):
        correct_journal_entry(
            db_session,
            restaurant_a.id,
            original.id,
            date(2026, 1, 2),
            "Bad lines",
            [
                PostingLine(bank_id, 300_00, AccountNormalBalance.DEBIT),
                PostingLine(ap_id, 250_00, AccountNormalBalance.CREDIT),
            ],
            actor_id=actor_id,
        )

    with entity_context(db_session, restaurant_a.id):
        db_session.refresh(original)
        assert original.status == JournalEntryStatus.POSTED
        assert original.reversed_by_entry_id is None
        assert original.amended_by_entry_id is None
        assert len(list(db_session.scalars(select(JournalEntry)))) == 1


def test_correct_rejects_already_voided(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    original = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Void first",
        [
            PostingLine(bank_id, 100_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 100_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )
    void_journal_entry(db_session, restaurant_a.id, original.id, actor_id=actor_id)

    with pytest.raises(AlreadyVoidedError):
        correct_journal_entry(
            db_session,
            restaurant_a.id,
            original.id,
            date(2026, 1, 2),
            "Too late",
            [
                PostingLine(bank_id, 100_00, AccountNormalBalance.DEBIT),
                PostingLine(ap_id, 100_00, AccountNormalBalance.CREDIT),
            ],
            actor_id=actor_id,
        )


def test_correct_rejects_reversal_entry(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    original = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Source entry",
        [
            PostingLine(bank_id, 150_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 150_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )
    _, reversal = void_journal_entry(
        db_session, restaurant_a.id, original.id, actor_id=actor_id
    )

    with pytest.raises(NotVoidableError):
        correct_journal_entry(
            db_session,
            restaurant_a.id,
            reversal.id,
            date(2026, 1, 2),
            "Cannot amend reversal",
            [
                PostingLine(bank_id, 150_00, AccountNormalBalance.DEBIT),
                PostingLine(ap_id, 150_00, AccountNormalBalance.CREDIT),
            ],
            actor_id=actor_id,
        )


def test_correct_audit_trail(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    original = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Audit amend",
        [
            PostingLine(bank_id, 400_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 400_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )

    voided, reversal, corrected = correct_journal_entry(
        db_session,
        restaurant_a.id,
        original.id,
        date(2026, 1, 2),
        "Fixed",
        [
            PostingLine(bank_id, 450_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 450_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        reason="Typo in amount",
    )

    with entity_context(db_session, restaurant_a.id):
        void_event = db_session.scalar(
            select(LedgerAuditEvent).where(
                LedgerAuditEvent.journal_entry_id == voided.id,
                LedgerAuditEvent.action == LedgerAuditAction.VOID,
            )
        )
        assert void_event is not None
        assert void_event.actor_id == actor_id
        assert void_event.reason == "Typo in amount"

        reversal_post = db_session.scalar(
            select(LedgerAuditEvent).where(
                LedgerAuditEvent.journal_entry_id == reversal.id,
                LedgerAuditEvent.action == LedgerAuditAction.POST,
            )
        )
        assert reversal_post is not None
        assert reversal_post.actor_id == actor_id
        assert reversal_post.reason == "Typo in amount"

        corrected_posts = list(
            db_session.scalars(
                select(LedgerAuditEvent).where(
                    LedgerAuditEvent.journal_entry_id == corrected.id,
                    LedgerAuditEvent.action == LedgerAuditAction.POST,
                )
            )
        )
        assert len(corrected_posts) == 1
        assert corrected_posts[0].actor_id == actor_id

        amend_event = db_session.scalar(
            select(LedgerAuditEvent).where(
                LedgerAuditEvent.journal_entry_id == corrected.id,
                LedgerAuditEvent.action == LedgerAuditAction.AMEND,
            )
        )
        assert amend_event is not None
        assert amend_event.actor_id == actor_id
        assert amend_event.reason == "Typo in amount"


def test_api_correct_entry(
    client: TestClient, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    post_response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json={
            "entry_date": "2026-01-01",
            "description": "API correct test",
            "actor_id": str(actor_id),
            "lines": [
                {"account_id": str(bank_id), "amount_kurus": 10000, "side": "debit"},
                {"account_id": str(ap_id), "amount_kurus": 10000, "side": "credit"},
            ],
        },
    )
    assert post_response.status_code == 201
    entry_id = post_response.json()["id"]

    correct_response = client.post(
        f"/entities/{restaurant_a.id}/ledger/entries/{entry_id}/correct",
        json={
            "entry_date": "2026-01-03",
            "description": "API corrected",
            "actor_id": str(actor_id),
            "reason": "API amend",
            "void_date": "2026-01-02",
            "lines": [
                {"account_id": str(bank_id), "amount_kurus": 15000, "side": "debit"},
                {"account_id": str(ap_id), "amount_kurus": 15000, "side": "credit"},
            ],
        },
    )
    assert correct_response.status_code == 200
    body = correct_response.json()
    assert body["original"]["status"] == "voided"
    assert body["original"]["amended_by_entry_id"] == body["corrected"]["id"]
    assert body["corrected"]["amends_entry_id"] == entry_id
    assert body["corrected"]["source"] == "manual"
    assert body["reversal"]["reverses_entry_id"] == entry_id
