"""Double-entry posting service — single boundary (Decisions §1, CURSOR_RULES §1 #10)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.models import (
    ImmutableJournalError,
    JournalEntry,
    JournalEntryLine,
    JournalEntrySource,
    JournalEntryStatus,
    LedgerAuditAction,
    LedgerAuditEvent,
)
from app.core.ledger.posting import (
    AlreadyVoidedError,
    EntityMismatchError,
    PostingLine,
    UnbalancedEntryError,
    ZeroAmountError,
    post_journal_entry,
    void_journal_entry,
)
from app.db.session import entity_context
from app.features.entities.models import Entity


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


def test_balanced_post_succeeds(db_session, restaurant_a, seeded_accounts, actor_id) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    entry = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Opening bank and payables",
        [
            PostingLine(bank_id, 1_000_000, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 1_000_000, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )
    assert entry.entity_id == restaurant_a.id
    assert entry.status == JournalEntryStatus.POSTED
    assert len(entry.lines) == 2
    debits = sum(
        l.amount_kurus for l in entry.lines if l.side == AccountNormalBalance.DEBIT
    )
    credits = sum(
        l.amount_kurus for l in entry.lines if l.side == AccountNormalBalance.CREDIT
    )
    assert debits == credits == 1_000_000


def test_unbalanced_post_rejected(db_session, restaurant_a, seeded_accounts, actor_id) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    with pytest.raises(UnbalancedEntryError, match="debits .* must equal credits"):
        post_journal_entry(
            db_session,
            restaurant_a.id,
            date(2026, 1, 1),
            "Bad entry",
            [
                PostingLine(bank_id, 1_000_000, AccountNormalBalance.DEBIT),
                PostingLine(ap_id, 999_999, AccountNormalBalance.CREDIT),
            ],
            actor_id=actor_id,
            source=JournalEntrySource.MANUAL,
        )


def test_zero_amount_rejected(db_session, restaurant_a, seeded_accounts, actor_id) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    with pytest.raises(ZeroAmountError):
        post_journal_entry(
            db_session,
            restaurant_a.id,
            date(2026, 1, 1),
            "Zero line",
            [
                PostingLine(bank_id, 0, AccountNormalBalance.DEBIT),
                PostingLine(ap_id, 100, AccountNormalBalance.CREDIT),
            ],
            actor_id=actor_id,
            source=JournalEntrySource.MANUAL,
        )


def test_cross_entity_account_rejected(
    db_session, restaurant_a, restaurant_b, seeded_accounts, actor_id
) -> None:
    seed_default_chart(db_session, restaurant_b.id)
    with entity_context(db_session, restaurant_b.id):
        from app.core.chart_of_accounts.models import Account

        b_bank_id = db_session.scalar(
            select(Account.id).where(Account.code == "1100")
        )
    assert b_bank_id is not None

    a_ap_id = seeded_accounts["2000"]
    with pytest.raises(EntityMismatchError, match="belongs to entity"):
        post_journal_entry(
            db_session,
            restaurant_a.id,
            date(2026, 1, 1),
            "Cross entity",
            [
                PostingLine(b_bank_id, 500_00, AccountNormalBalance.DEBIT),
                PostingLine(a_ap_id, 500_00, AccountNormalBalance.CREDIT),
            ],
            actor_id=actor_id,
            source=JournalEntrySource.MANUAL,
        )


def test_entity_b_cannot_see_entity_a_journal(
    db_session, restaurant_a, restaurant_b, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    equity_id = seeded_accounts["3900"]
    post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "A only",
        [
            PostingLine(bank_id, 100_00, AccountNormalBalance.DEBIT),
            PostingLine(equity_id, 100_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )
    seed_default_chart(db_session, restaurant_b.id)

    with entity_context(db_session, restaurant_b.id):
        entries = list(db_session.scalars(select(JournalEntry)))
        assert entries == []


def test_api_post_entry(client: TestClient, restaurant_a, seeded_accounts, actor_id) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json={
            "entry_date": "2026-01-01",
            "description": "Test post",
            "actor_id": str(actor_id),
            "lines": [
                {
                    "account_id": str(bank_id),
                    "amount_kurus": 250000,
                    "side": "debit",
                },
                {
                    "account_id": str(ap_id),
                    "amount_kurus": 250000,
                    "side": "credit",
                },
            ],
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["entity_id"] == str(restaurant_a.id)
    assert body["status"] == "posted"
    assert body["source"] == "manual"
    assert len(body["lines"]) == 2
    assert body["lines"][0]["account_code"] == "1100"


def test_posted_entry_cannot_be_edited(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    entry = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Immutable",
        [
            PostingLine(bank_id, 100_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 100_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )
    entry.description = "Changed"
    with entity_context(db_session, restaurant_a.id):
        with pytest.raises(ImmutableJournalError, match="cannot be modified"):
            db_session.commit()


def test_posted_entry_cannot_be_deleted(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    entry = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "No delete",
        [
            PostingLine(bank_id, 100_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 100_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )
    with entity_context(db_session, restaurant_a.id):
        db_session.delete(entry)
        with pytest.raises(ImmutableJournalError, match="cannot be deleted"):
            db_session.commit()


def test_posted_line_cannot_be_edited(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    entry = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Line immutable",
        [
            PostingLine(bank_id, 100_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 100_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )
    line = entry.lines[0]
    line.amount_kurus = 200_00
    with entity_context(db_session, restaurant_a.id):
        with pytest.raises(ImmutableJournalError, match="lines cannot be modified"):
            db_session.commit()


def _net_balance_by_account(db_session, entity_id: uuid.UUID) -> dict[uuid.UUID, int]:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(
                JournalEntryLine.account_id,
                JournalEntryLine.side,
                func.sum(JournalEntryLine.amount_kurus),
            )
            .join(JournalEntry)
            .group_by(JournalEntryLine.account_id, JournalEntryLine.side)
        ).all()
    net: dict[uuid.UUID, int] = {}
    for account_id, side, total in rows:
        signed = total if side == AccountNormalBalance.DEBIT else -total
        net[account_id] = net.get(account_id, 0) + signed
    return net


def test_void_reversal_nets_to_zero_and_both_visible(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    original = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "To void",
        [
            PostingLine(bank_id, 500_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 500_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )

    voided, reversal = void_journal_entry(
        db_session,
        restaurant_a.id,
        original.id,
        actor_id=actor_id,
        reason="Posted in error",
        void_date=date(2026, 1, 2),
    )

    assert voided.status == JournalEntryStatus.VOIDED
    assert voided.reversed_by_entry_id == reversal.id
    assert reversal.reverses_entry_id == original.id
    assert reversal.status == JournalEntryStatus.POSTED

    with entity_context(db_session, restaurant_a.id):
        entries = list(db_session.scalars(select(JournalEntry)))
        assert len(entries) == 2

    net = _net_balance_by_account(db_session, restaurant_a.id)
    assert net.get(bank_id, 0) == 0
    assert net.get(ap_id, 0) == 0


def test_void_twice_rejected(db_session, restaurant_a, seeded_accounts, actor_id) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    original = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Once",
        [
            PostingLine(bank_id, 100_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 100_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )
    void_journal_entry(
        db_session, restaurant_a.id, original.id, actor_id=actor_id
    )
    with pytest.raises(AlreadyVoidedError):
        void_journal_entry(
            db_session, restaurant_a.id, original.id, actor_id=actor_id
        )


def test_audit_trail_on_post_and_void(
    db_session, restaurant_a, seeded_accounts, actor_id
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    original = post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Audited",
        [
            PostingLine(bank_id, 300_00, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 300_00, AccountNormalBalance.CREDIT),
        ],
        actor_id=actor_id,
        source=JournalEntrySource.MANUAL,
    )

    with entity_context(db_session, restaurant_a.id):
        post_events = list(
            db_session.scalars(
                select(LedgerAuditEvent).where(
                    LedgerAuditEvent.journal_entry_id == original.id,
                    LedgerAuditEvent.action == LedgerAuditAction.POST,
                )
            )
        )
        assert len(post_events) == 1
        assert post_events[0].actor_id == actor_id
        assert post_events[0].reason is None
        assert post_events[0].created_at is not None

    void_journal_entry(
        db_session,
        restaurant_a.id,
        original.id,
        actor_id=actor_id,
        reason="Wrong amount",
    )

    with entity_context(db_session, restaurant_a.id):
        db_session.refresh(original)
        void_events = list(
            db_session.scalars(
                select(LedgerAuditEvent).where(
                    LedgerAuditEvent.action == LedgerAuditAction.VOID
                )
            )
        )
        assert len(void_events) == 1
        assert void_events[0].actor_id == actor_id
        assert void_events[0].reason == "Wrong amount"

        reversal_id = original.reversed_by_entry_id
        assert reversal_id is not None
        reversal_post = db_session.scalar(
            select(LedgerAuditEvent).where(
                LedgerAuditEvent.journal_entry_id == reversal_id,
                LedgerAuditEvent.action == LedgerAuditAction.POST,
            )
        )
        assert reversal_post is not None
        assert reversal_post.reason == "Wrong amount"


def test_api_void_entry(client: TestClient, restaurant_a, seeded_accounts, actor_id) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    post_response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json={
            "entry_date": "2026-01-01",
            "description": "API void test",
            "actor_id": str(actor_id),
            "lines": [
                {"account_id": str(bank_id), "amount_kurus": 10000, "side": "debit"},
                {"account_id": str(ap_id), "amount_kurus": 10000, "side": "credit"},
            ],
        },
    )
    entry_id = post_response.json()["id"]

    void_response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals/{entry_id}/void",
        json={"actor_id": str(actor_id), "reason": "Test void"},
    )
    assert void_response.status_code == 200
    body = void_response.json()
    assert body["original"]["status"] == "voided"
    assert body["reversal"]["reverses_entry_id"] == entry_id
    assert body["original"]["reversed_by_entry_id"] == body["reversal"]["id"]
