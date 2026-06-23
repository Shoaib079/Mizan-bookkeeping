"""POS/delivery settlement idempotency — Phase 8.6 Item 3."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.config import settings
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.pos.models import PosSettlement

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def settlement_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )
    return {"entity_id": restaurant_a.id, "bank": bank}


def test_post_pos_settlement_dedup_by_card_sales_batch_id(
    db_session, settlement_setup, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    entity_id = settlement_setup["entity_id"]
    bank = settlement_setup["bank"]

    batch_id = pos_posting.post_card_sales_batch(
        db_session,
        entity_id,
        sales_date=date(2026, 6, 1),
        gross_amount_kurus=500_000,
        description="June card sales",
        actor_id=ACTOR_ID,
    ).card_sales_batch.id

    first = pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 6, 3),
        amount_kurus=485_000,
        description="POS deposit",
        actor_id=ACTOR_ID,
        card_sales_batch_id=batch_id,
        commission_kurus=15_000,
    )
    second = pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 6, 3),
        amount_kurus=485_000,
        description="POS deposit retry",
        actor_id=ACTOR_ID,
        card_sales_batch_id=batch_id,
        commission_kurus=15_000,
    )

    assert second.pos_settlement.id == first.pos_settlement.id
    assert second.journal_entry.id == first.journal_entry.id

    with entity_context(db_session, entity_id):
        count = db_session.scalar(select(func.count()).select_from(PosSettlement)) or 0
        assert count == 1


def test_classify_pos_settlement_links_existing_manual_settlement(
    db_session, settlement_setup, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "idempotency_enforcement", True)
    from app.features.banking import statements as stmt_service
    from app.features.banking.statement_models import StatementLineClassification

    entity_id = settlement_setup["entity_id"]
    bank = settlement_setup["bank"]

    manual = pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 6, 5),
        amount_kurus=200_000,
        description="Manual POS settlement",
        actor_id=ACTOR_ID,
    )
    manual_settlement_id = manual.pos_settlement.id
    manual_journal_id = manual.journal_entry.id

    with entity_context(db_session, entity_id):
        from app.features.banking.statements import _find_matching_pos_settlement

        matched = _find_matching_pos_settlement(
            db_session,
            money_account_id=bank.id,
            amount_kurus=200_000,
            settlement_date=date(2026, 6, 5),
        )
        assert matched is not None
        assert matched.id == manual_settlement_id

    csv = (
        "transaction_date,amount_kurus,description,reference\n"
        "2026-06-05,200000,POS deposit bank,POS-IDEM\n"
    ).encode()
    statement = stmt_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="pos-idem.csv",
    )
    line = statement.lines[0]

    result = stmt_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line.id,
        classification=StatementLineClassification.POS_SETTLEMENT,
        actor_id=ACTOR_ID,
    )

    assert result.linked_existing_settlement is True
    assert result.journal_entry_id == manual_journal_id
    assert result.line.pos_settlement_id == manual_settlement_id

    with entity_context(db_session, entity_id):
        settlement_count = db_session.scalar(select(func.count()).select_from(PosSettlement)) or 0
        assert settlement_count == 1
