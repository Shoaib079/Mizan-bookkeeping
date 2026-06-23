"""POS card commission — total clearance sweep (Slice B2).

Both banks' card deposits land in the one card-clearing account (1400). Whatever
is left after deposits is the hidden bank commission, swept to 5300 on demand by
one action — no per-entity setting, no per-deposit commission entry.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    BANK_CHARGES_CODE,
    CARD_SALES_CLEARING_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _bank(db_session, entity_id, name):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name=name, bank_name=name),
    )


@pytest.fixture
def setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank1 = _bank(db_session, restaurant_a.id, "Garanti")
    bank2 = _bank(db_session, restaurant_a.id, "Akbank")
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "bank1": bank1,
        "bank2": bank2,
        "accounts": accounts,
    }


def _gl_balance(db_session, entity_id, account_id) -> int:
    with entity_context(db_session, entity_id):
        debit = int(
            db_session.scalar(
                select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0)).where(
                    JournalEntryLine.account_id == account_id,
                    JournalEntryLine.side == AccountNormalBalance.DEBIT,
                )
            )
            or 0
        )
        credit = int(
            db_session.scalar(
                select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0)).where(
                    JournalEntryLine.account_id == account_id,
                    JournalEntryLine.side == AccountNormalBalance.CREDIT,
                )
            )
            or 0
        )
    return debit - credit


def _card_sales(db_session, entity_id, amount):
    pos_posting.post_card_sales_batch(
        db_session,
        entity_id,
        sales_date=date(2026, 6, 1),
        gross_amount_kurus=amount,
        description="card sales",
        actor_id=ACTOR_ID,
    )


def _net_deposit(db_session, entity_id, bank, amount, when):
    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=when,
        amount_kurus=amount,
        description="net deposit",
        actor_id=ACTOR_ID,
    )


def test_two_banks_one_clearing_residual_is_commission(client, db_session, setup) -> None:
    entity_id = setup["entity_id"]
    clearing_id = setup["accounts"][CARD_SALES_CLEARING_CODE]
    charges_id = setup["accounts"][BANK_CHARGES_CODE]

    # 1,000,000 of card sales clear to 1400; deposits arrive net across two banks.
    _card_sales(db_session, entity_id, 1_000_000)
    _net_deposit(db_session, entity_id, setup["bank1"], 600_000, date(2026, 6, 2))
    _net_deposit(db_session, entity_id, setup["bank2"], 380_000, date(2026, 6, 3))
    # Leftover in clearing = 1,000,000 - 980,000 = 20,000 commission.
    assert _gl_balance(db_session, entity_id, clearing_id) == 20_000

    resp = client.post(
        f"/entities/{entity_id}/pos/clearing-reconciliation/clear-commission",
        json={"actor_id": str(ACTOR_ID), "clearance_date": "2026-06-30"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["commission_kurus"] == 20_000
    assert body["clearing_balance_after_kurus"] == 0

    # 1400 zeroed; commission booked to 5300.
    assert _gl_balance(db_session, entity_id, clearing_id) == 0
    assert _gl_balance(db_session, entity_id, charges_id) == 20_000

    with entity_context(db_session, entity_id):
        je = db_session.get(JournalEntry, uuid.UUID(body["journal_entry_id"]))
        assert je.source == JournalEntrySource.POS_COMMISSION_SWEEP


def test_clear_is_repeatable_after_more_sales(client, db_session, setup) -> None:
    entity_id = setup["entity_id"]
    charges_id = setup["accounts"][BANK_CHARGES_CODE]

    _card_sales(db_session, entity_id, 500_000)
    _net_deposit(db_session, entity_id, setup["bank1"], 490_000, date(2026, 6, 2))
    first = client.post(
        f"/entities/{entity_id}/pos/clearing-reconciliation/clear-commission",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert first.status_code == 200
    assert first.json()["commission_kurus"] == 10_000

    # New cycle of sales + deposit, then clear again.
    _card_sales(db_session, entity_id, 300_000)
    _net_deposit(db_session, entity_id, setup["bank2"], 295_000, date(2026, 6, 9))
    second = client.post(
        f"/entities/{entity_id}/pos/clearing-reconciliation/clear-commission",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert second.status_code == 200
    assert second.json()["commission_kurus"] == 5_000
    assert _gl_balance(db_session, entity_id, charges_id) == 15_000


def test_clear_zero_balance_rejected(client, db_session, setup) -> None:
    entity_id = setup["entity_id"]
    _card_sales(db_session, entity_id, 100_000)
    _net_deposit(db_session, entity_id, setup["bank1"], 100_000, date(2026, 6, 2))
    # Fully deposited, no commission left.
    resp = client.post(
        f"/entities/{entity_id}/pos/clearing-reconciliation/clear-commission",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert resp.status_code == 422
    assert "nothing to clear" in resp.json()["detail"].lower()


def test_clear_negative_balance_rejected(client, db_session, setup) -> None:
    entity_id = setup["entity_id"]
    _card_sales(db_session, entity_id, 100_000)
    # Deposit exceeds sales (data error) — clearing goes negative.
    _net_deposit(db_session, entity_id, setup["bank1"], 120_000, date(2026, 6, 2))
    resp = client.post(
        f"/entities/{entity_id}/pos/clearing-reconciliation/clear-commission",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert resp.status_code == 422
    assert "negative" in resp.json()["detail"].lower()


def test_void_clearance_restores_residual(client, db_session, setup) -> None:
    """Sweep is void-and-reenter: voiding it puts the commission back in clearing."""
    from app.core.ledger.posting import void_journal_entry

    entity_id = setup["entity_id"]
    clearing_id = setup["accounts"][CARD_SALES_CLEARING_CODE]

    _card_sales(db_session, entity_id, 200_000)
    _net_deposit(db_session, entity_id, setup["bank1"], 195_000, date(2026, 6, 2))
    resp = client.post(
        f"/entities/{entity_id}/pos/clearing-reconciliation/clear-commission",
        json={"actor_id": str(ACTOR_ID)},
    )
    je_id = uuid.UUID(resp.json()["journal_entry_id"])
    assert _gl_balance(db_session, entity_id, clearing_id) == 0

    void_journal_entry(db_session, entity_id, je_id, actor_id=ACTOR_ID, reason="redo")
    assert _gl_balance(db_session, entity_id, clearing_id) == 5_000
