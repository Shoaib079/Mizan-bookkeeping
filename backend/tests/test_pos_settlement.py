"""POS settlement intake — GL posting and statement classify (Phase 4 Slice 1)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import CARD_SALES_CLEARING_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.pos.models import PosSettlement

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


def test_manual_settlement_posts_gl_dr_bank_cr_clearing(db_session, pos_setup) -> None:
    entity_id = pos_setup["entity_id"]
    bank = pos_setup["bank"]
    clearing_id = pos_setup["accounts"][CARD_SALES_CLEARING_CODE]

    result = pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 3, 1),
        amount_kurus=850_000,
        description="POS settlement March 1",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.POS_SETTLEMENT
    assert result.pos_settlement.journal_entry_id == result.journal_entry.id

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[bank.gl_account_id].amount_kurus == 850_000
    assert by_account[bank.gl_account_id].side == AccountNormalBalance.DEBIT
    assert by_account[clearing_id].amount_kurus == 850_000
    assert by_account[clearing_id].side == AccountNormalBalance.CREDIT


def test_clearing_account_credit_reduces_debit_balance(db_session, pos_setup) -> None:
    entity_id = pos_setup["entity_id"]
    bank = pos_setup["bank"]
    clearing_id = pos_setup["accounts"][CARD_SALES_CLEARING_CODE]

    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 3, 1),
        amount_kurus=500_000,
        description="Settlement",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        bank_balance = banking_service.gl_balance_kurus(
            db_session,
            bank.gl_account_id,
            AccountNormalBalance.DEBIT,
        )
        clearing_balance = banking_service.gl_balance_kurus(
            db_session,
            clearing_id,
            AccountNormalBalance.DEBIT,
        )

    assert bank_balance == 500_000
    assert clearing_balance == -500_000


def test_classify_statement_inflow_pos_settlement_posts_gl(
    db_session, pos_setup, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("app.config.settings.upload_dir", str(tmp_path / "uploads"))
    entity_id = pos_setup["entity_id"]
    bank = pos_setup["bank"]
    clearing_id = pos_setup["accounts"][CARD_SALES_CLEARING_CODE]

    csv = (
        "transaction_date,amount_kurus,description,reference\n"
        "2026-03-05,1200000,POS card deposit,POS-001\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="pos.csv",
    )
    inflow_line = statement.lines[0]

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        inflow_line.id,
        classification=StatementLineClassification.POS_SETTLEMENT,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.classification == StatementLineClassification.POS_SETTLEMENT
    assert result.line.pos_settlement_id is not None
    assert result.journal_entry_id is not None

    with entity_context(db_session, entity_id):
        settlement = db_session.get(PosSettlement, result.line.pos_settlement_id)
        assert settlement is not None
        assert settlement.bank_statement_line_id == inflow_line.id
        assert settlement.reference_type == "bank_statement_line"
        assert settlement.reference_id == inflow_line.id

        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry_id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[bank.gl_account_id].side == AccountNormalBalance.DEBIT
    assert by_account[clearing_id].side == AccountNormalBalance.CREDIT
    assert by_account[bank.gl_account_id].amount_kurus == 1_200_000


@pytest.mark.parametrize("amount_kurus", [0, -100])
def test_zero_or_negative_amount_rejected(db_session, pos_setup, amount_kurus) -> None:
    with pytest.raises(ValueError, match="positive"):
        pos_posting.post_pos_settlement(
            db_session,
            pos_setup["entity_id"],
            money_account_id=pos_setup["bank"].id,
            settlement_date=date(2026, 3, 1),
            amount_kurus=amount_kurus,
            description="Invalid",
            actor_id=ACTOR_ID,
        )


def test_cross_entity_isolation(db_session, restaurant_a, restaurant_b) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    seed_default_chart(db_session, restaurant_b.id)
    bank_a = _bank_account(db_session, restaurant_a.id)

    pos_posting.post_pos_settlement(
        db_session,
        restaurant_a.id,
        money_account_id=bank_a.id,
        settlement_date=date(2026, 3, 1),
        amount_kurus=100_000,
        description="Entity A settlement",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_b.id):
        count_b = db_session.scalar(select(func.count()).select_from(PosSettlement))
        journal_count_b = db_session.scalar(select(func.count()).select_from(JournalEntry))

    assert count_b == 0
    assert journal_count_b == 0


def test_pos_settlement_api_e2e(client: TestClient, db_session, pos_setup) -> None:
    entity_id = pos_setup["entity_id"]
    bank = pos_setup["bank"]

    create_resp = client.post(
        f"/entities/{entity_id}/pos/settlements",
        json={
            "money_account_id": str(bank.id),
            "settlement_date": "2026-03-10",
            "amount_kurus": 750_000,
            "description": "API settlement",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["journal_entry_id"]
    assert created["amount_kurus"] == 750_000

    list_resp = client.get(f"/entities/{entity_id}/pos/settlements")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    detail_resp = client.get(
        f"/entities/{entity_id}/pos/settlements/{created['id']}"
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()["id"] == created["id"]

    bad_resp = client.post(
        f"/entities/{entity_id}/pos/settlements",
        json={
            "money_account_id": str(bank.id),
            "settlement_date": "2026-03-10",
            "amount_kurus": 0,
            "description": "Bad",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert bad_resp.status_code == 422


def test_classify_pos_settlement_rejects_outflow(
    db_session, pos_setup, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("app.config.settings.upload_dir", str(tmp_path / "uploads"))
    entity_id = pos_setup["entity_id"]
    bank = pos_setup["bank"]

    csv = (
        "transaction_date,amount_kurus,description,reference\n"
        "2026-03-05,-50000,Not a deposit,FEE-1\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="outflow.csv",
    )

    with pytest.raises(statement_service.InvalidClassificationError, match="inflow"):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            statement.lines[0].id,
            classification=StatementLineClassification.POS_SETTLEMENT,
            actor_id=ACTOR_ID,
        )
