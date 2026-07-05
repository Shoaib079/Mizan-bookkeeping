"""BSF-1 — deterministic bank fee auto-post on statement import."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.bank_fee_settings import BANK_FEE_AUTO_POST_CEILING_KEY
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.classification_rule_models import StatementClassificationRule
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)
from app.features.entities import service as entity_service
from app.features.entities.schema import EntitySettingCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _import_outflow(
    db_session,
    entity_id: uuid.UUID,
    bank_id: uuid.UUID,
    *,
    tx_date: str,
    amount_lira: str,
    description: str,
    reference: str,
):
    csv = (
        "transaction_date,amount,description,reference\n"
        f'{tx_date},"{amount_lira}",{description},{reference}\n'
    ).encode()
    return statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_id,
        csv,
        original_filename=f"{reference}.csv",
    )


@pytest.fixture
def bank_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="BSF Fee Bank",
            bank_name="Test",
        ),
    )
    return {"entity_id": restaurant_a.id, "bank": bank}


def test_import_auto_posts_hesap_isletim_ucreti(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    statement = _import_outflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-04-01",
        amount_lira="-12,50",
        description="HESAP İŞLETİM ÜCRETİ 12,50",
        reference="FEE-ISLETIM",
    )
    line_id = statement.lines[0].id

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, line_id)
        assert line is not None
        assert line.status == StatementLineStatus.POSTED
        assert line.classification == StatementLineClassification.BANK_FEE
        assert line.classification_source == StatementLineClassificationSource.RULE_AUTO.value
        journal = db_session.get(JournalEntry, line.journal_entry_id)
        assert journal is not None
        assert journal.source == JournalEntrySource.RULE_AUTO


def test_import_auto_posts_bsmv(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    statement = _import_outflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-04-02",
        amount_lira="-3,40",
        description="BSMV 3,40",
        reference="FEE-BSMV",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.POSTED
        assert line.classification_source == StatementLineClassificationSource.RULE_AUTO.value


def test_havale_supplier_payment_not_auto_posted_as_fee(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    statement = _import_outflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-04-03",
        amount_lira="-5.000,00",
        description="HAVALE TRENDYOL 5.000,00",
        reference="PAY-TRENDYOL",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.IMPORTED
        assert line.journal_entry_id is None
        assert line.classification != StatementLineClassification.BANK_FEE


def test_fee_over_ceiling_routes_to_needs_review(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    entity_service.create_entity_setting(
        db_session,
        entity_id,
        EntitySettingCreate(
            key=BANK_FEE_AUTO_POST_CEILING_KEY,
            value="1000",
        ),
    )

    statement = _import_outflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-04-04",
        amount_lira="-50,00",
        description="HESAP İŞLETİM ÜCRETİ 50,00",
        reference="FEE-OVER",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.NEEDS_REVIEW
        assert line.classification == StatementLineClassification.BANK_FEE
        assert line.journal_entry_id is None
        assert "ceiling" in (line.review_reason or "").lower()


def test_deterministic_fee_post_does_not_require_learned_rule(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    statement = _import_outflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-04-05",
        amount_lira="-8,00",
        description="BSMV 8,00",
        reference="FEE-NORULE",
    )

    with entity_context(db_session, entity_id):
        rules = list(db_session.scalars(select(StatementClassificationRule)).all())
        assert rules == []
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.POSTED
