"""Double-entry posting service — single boundary (Decisions §1, CURSOR_RULES §1 #10)."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.models import JournalEntry
from app.core.ledger.posting import (
    EntityMismatchError,
    PostingLine,
    UnbalancedEntryError,
    ZeroAmountError,
    post_journal_entry,
)
from app.db.session import entity_context
from app.features.entities.models import Entity


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        from app.core.chart_of_accounts.models import Account

        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def test_balanced_post_succeeds(db_session, restaurant_a, seeded_accounts) -> None:
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
    )
    assert entry.entity_id == restaurant_a.id
    assert len(entry.lines) == 2
    debits = sum(
        l.amount_kurus for l in entry.lines if l.side == AccountNormalBalance.DEBIT
    )
    credits = sum(
        l.amount_kurus for l in entry.lines if l.side == AccountNormalBalance.CREDIT
    )
    assert debits == credits == 1_000_000


def test_unbalanced_post_rejected(db_session, restaurant_a, seeded_accounts) -> None:
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
        )


def test_zero_amount_rejected(db_session, restaurant_a, seeded_accounts) -> None:
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
        )


def test_cross_entity_account_rejected(
    db_session, restaurant_a, restaurant_b, seeded_accounts
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
        )


def test_entity_b_cannot_see_entity_a_journal(
    db_session, restaurant_a, restaurant_b, seeded_accounts
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
    )
    seed_default_chart(db_session, restaurant_b.id)

    with entity_context(db_session, restaurant_b.id):
        entries = list(db_session.scalars(select(JournalEntry)))
        assert entries == []


def test_api_post_entry(client: TestClient, restaurant_a, seeded_accounts) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts["2000"]
    response = client.post(
        f"/entities/{restaurant_a.id}/ledger/entries",
        json={
            "entry_date": "2026-01-01",
            "description": "Test post",
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
    assert len(body["lines"]) == 2
