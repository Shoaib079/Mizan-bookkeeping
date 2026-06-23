"""Card sales batches and settlement commission reconciliation (Phase 4 Slice 3)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    BANK_CHARGES_CODE,
    CARD_SALES_CLEARING_CODE,
    SALES_REVENUE_CODE,
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
from app.features.pos.models import CardSalesBatch, PosSettlement

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


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
def pos_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = _bank_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "accounts": accounts,
    }


def test_card_sales_batch_posts_dr_clearing_cr_revenue(db_session, pos_setup) -> None:
    entity_id = pos_setup["entity_id"]
    clearing_id = pos_setup["accounts"][CARD_SALES_CLEARING_CODE]
    revenue_id = pos_setup["accounts"][SALES_REVENUE_CODE]

    result = pos_posting.post_card_sales_batch(
        db_session,
        entity_id,
        sales_date=date(2026, 3, 1),
        gross_amount_kurus=1_000_000,
        description="March 1 card sales",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.CARD_SALES
    assert result.card_sales_batch.journal_entry_id == result.journal_entry.id

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[clearing_id].amount_kurus == 1_000_000
    assert by_account[clearing_id].side == AccountNormalBalance.DEBIT
    assert by_account[revenue_id].amount_kurus == 1_000_000
    assert by_account[revenue_id].side == AccountNormalBalance.CREDIT


def test_settlement_with_explicit_commission_zeros_clearing(db_session, pos_setup) -> None:
    entity_id = pos_setup["entity_id"]
    bank = pos_setup["bank"]
    clearing_id = pos_setup["accounts"][CARD_SALES_CLEARING_CODE]
    bank_charges_id = pos_setup["accounts"][BANK_CHARGES_CODE]

    pos_posting.post_card_sales_batch(
        db_session,
        entity_id,
        sales_date=date(2026, 3, 1),
        gross_amount_kurus=1_000_000,
        description="Sales",
        actor_id=ACTOR_ID,
    )

    result = pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 3, 5),
        amount_kurus=970_000,
        description="Settlement with commission",
        actor_id=ACTOR_ID,
        commission_kurus=30_000,
    )

    assert result.pos_settlement.commission_kurus == 30_000
    assert result.pos_settlement.commission_inferred is False

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}
        clearing_balance = banking_service.gl_balance_kurus(
            db_session,
            clearing_id,
            AccountNormalBalance.DEBIT,
        )

    assert len(lines) == 3
    assert by_account[bank.gl_account_id].amount_kurus == 970_000
    assert by_account[bank.gl_account_id].side == AccountNormalBalance.DEBIT
    assert by_account[bank_charges_id].amount_kurus == 30_000
    assert by_account[bank_charges_id].side == AccountNormalBalance.DEBIT
    assert by_account[clearing_id].amount_kurus == 1_000_000
    assert by_account[clearing_id].side == AccountNormalBalance.CREDIT
    assert clearing_balance == 0


def test_inferred_commission_from_linked_batch(db_session, pos_setup) -> None:
    entity_id = pos_setup["entity_id"]
    bank = pos_setup["bank"]
    clearing_id = pos_setup["accounts"][CARD_SALES_CLEARING_CODE]

    batch_result = pos_posting.post_card_sales_batch(
        db_session,
        entity_id,
        sales_date=date(2026, 3, 2),
        gross_amount_kurus=500_000,
        description="Batch for inference",
        actor_id=ACTOR_ID,
    )
    batch_id = batch_result.card_sales_batch.id

    result = pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 3, 6),
        amount_kurus=485_000,
        description="Inferred commission settlement",
        actor_id=ACTOR_ID,
        card_sales_batch_id=batch_id,
    )

    assert result.pos_settlement.commission_kurus == 15_000
    assert result.pos_settlement.commission_inferred is True
    assert result.pos_settlement.card_sales_batch_id == batch_id

    with entity_context(db_session, entity_id):
        clearing_balance = banking_service.gl_balance_kurus(
            db_session,
            clearing_id,
            AccountNormalBalance.DEBIT,
        )

    assert clearing_balance == 0


def test_reconciliation_in_transit_after_sale_before_settlement(
    client: TestClient, db_session, pos_setup
) -> None:
    entity_id = pos_setup["entity_id"]

    pos_posting.post_card_sales_batch(
        db_session,
        entity_id,
        sales_date=date(2026, 3, 3),
        gross_amount_kurus=800_000,
        description="Unreconciled sales",
        actor_id=ACTOR_ID,
    )

    resp = client.get(f"/entities/{entity_id}/pos/clearing-reconciliation")
    assert resp.status_code == 200
    data = resp.json()

    assert data["total_card_sales_kurus"] == 800_000
    assert data["total_settled_gross_kurus"] == 0
    assert data["in_transit_kurus"] == 800_000
    assert data["clearing_balance_kurus"] == 800_000
    assert data["card_sales_batch_count"] == 1
    assert data["pos_settlement_count"] == 0


def test_net_only_settlement_unchanged_two_line_journal(db_session, pos_setup) -> None:
    entity_id = pos_setup["entity_id"]
    bank = pos_setup["bank"]
    clearing_id = pos_setup["accounts"][CARD_SALES_CLEARING_CODE]

    result = pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 3, 1),
        amount_kurus=850_000,
        description="Net-only settlement",
        actor_id=ACTOR_ID,
    )

    assert result.pos_settlement.commission_kurus is None
    assert result.pos_settlement.commission_inferred is False

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert len(lines) == 2
    assert by_account[bank.gl_account_id].amount_kurus == 850_000
    assert by_account[clearing_id].amount_kurus == 850_000


def test_inferred_commission_rejects_net_exceeding_batch_gross(db_session, pos_setup) -> None:
    entity_id = pos_setup["entity_id"]
    bank = pos_setup["bank"]

    batch_result = pos_posting.post_card_sales_batch(
        db_session,
        entity_id,
        sales_date=date(2026, 3, 4),
        gross_amount_kurus=100_000,
        description="Small batch",
        actor_id=ACTOR_ID,
    )

    with pytest.raises(pos_posting.InvalidPosSettlementError, match="exceeds"):
        pos_posting.post_pos_settlement(
            db_session,
            entity_id,
            money_account_id=bank.id,
            settlement_date=date(2026, 3, 8),
            amount_kurus=150_000,
            description="Too large",
            actor_id=ACTOR_ID,
            card_sales_batch_id=batch_result.card_sales_batch.id,
        )


def test_cross_entity_isolation(db_session, restaurant_a, restaurant_b) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    seed_default_chart(db_session, restaurant_b.id)
    bank_a = _bank_account(db_session, restaurant_a.id)

    pos_posting.post_card_sales_batch(
        db_session,
        restaurant_a.id,
        sales_date=date(2026, 3, 1),
        gross_amount_kurus=200_000,
        description="Entity A sales",
        actor_id=ACTOR_ID,
    )
    pos_posting.post_pos_settlement(
        db_session,
        restaurant_a.id,
        money_account_id=bank_a.id,
        settlement_date=date(2026, 3, 2),
        amount_kurus=200_000,
        description="Entity A settlement",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_b.id):
        batch_count = db_session.scalar(select(func.count()).select_from(CardSalesBatch))
        settlement_count = db_session.scalar(select(func.count()).select_from(PosSettlement))
        journal_count = db_session.scalar(select(func.count()).select_from(JournalEntry))

    assert batch_count == 0
    assert settlement_count == 0
    assert journal_count == 0


def test_card_sales_and_settlement_api_e2e(client: TestClient, pos_setup) -> None:
    entity_id = pos_setup["entity_id"]
    bank = pos_setup["bank"]

    batch_resp = client.post(
        f"/entities/{entity_id}/pos/card-sales",
        json={
            "sales_date": "2026-03-10",
            "gross_amount_kurus": 600_000,
            "description": "API card sales",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert batch_resp.status_code == 201
    batch = batch_resp.json()
    assert batch["journal_entry_id"]

    list_batches = client.get(f"/entities/{entity_id}/pos/card-sales")
    assert list_batches.status_code == 200
    assert list_batches.json()["total"] == 1

    settle_resp = client.post(
        f"/entities/{entity_id}/pos/settlements",
        json={
            "money_account_id": str(bank.id),
            "settlement_date": "2026-03-12",
            "amount_kurus": 582_000,
            "description": "API settlement with commission",
            "actor_id": str(ACTOR_ID),
            "commission_kurus": 18_000,
            "card_sales_batch_id": batch["id"],
        },
    )
    assert settle_resp.status_code == 201
    settled = settle_resp.json()
    assert settled["commission_kurus"] == 18_000
    assert settled["card_sales_batch_id"] == batch["id"]

    recon_resp = client.get(f"/entities/{entity_id}/pos/clearing-reconciliation")
    assert recon_resp.status_code == 200
    recon = recon_resp.json()
    assert recon["clearing_balance_kurus"] == 0
    assert recon["in_transit_kurus"] == 0
