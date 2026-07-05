"""P8 — store / grocery card spend (no-invoice retail purchases)."""

from __future__ import annotations

import uuid

import pytest

from app.core.banking.store_purchase_detect import is_store_purchase_description
from app.core.chart_of_accounts.default_chart import SUPPLIES_EXPENSE_CODE
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.learning import HIGH_CONFIDENCE_THRESHOLD
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.classification_learning import learn_classification_rule
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)
from app.features.banking.supplier_suggest_service import suggest_line_classification
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
MIGROS_DESCRIPTION = "POS MIGROS SANAL MARKET ISTANBUL 20260705"


@pytest.fixture
def store_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        from app.core.chart_of_accounts.models import Account
        from sqlalchemy import select

        supplies_id = db_session.scalar(
            select(Account.id).where(Account.code == SUPPLIES_EXPENSE_CODE)
        )
        assert supplies_id is not None

    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Store Purchase Bank",
            bank_name="Test",
        ),
    )
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "supplies_id": supplies_id,
    }


def test_store_purchase_detect_migros() -> None:
    match = is_store_purchase_description(MIGROS_DESCRIPTION)
    assert match is not None
    assert match.store_name == "Migros"


def test_migros_outflow_suggests_store_purchase_not_supplier(db_session, store_setup) -> None:
    entity_id = store_setup["entity_id"]
    supplier_service.create_supplier(
        db_session,
        entity_id,
        SupplierCreate(name="Migros Toptan", vkn="1111111111"),
    )

    suggestion = suggest_line_classification(
        db_session,
        entity_id,
        MIGROS_DESCRIPTION,
        amount_kurus=-45_000,
    )
    assert suggestion is not None
    assert suggestion.classification == StatementLineClassification.STORE_PURCHASE
    assert suggestion.supplier_id is None
    assert suggestion.expense_account_id == store_setup["supplies_id"]


def test_store_purchase_classify_posts_dr_supplies_cr_bank(db_session, store_setup) -> None:
    entity_id = store_setup["entity_id"]
    csv = (
        "transaction_date,amount,description,reference\n"
        f'2026-07-05,"-450,00",{MIGROS_DESCRIPTION},MIG-1\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        store_setup["bank"].id,
        csv,
        original_filename="migros.csv",
    )

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        statement.lines[0].id,
        classification=StatementLineClassification.STORE_PURCHASE,
        actor_id=ACTOR_ID,
        expense_account_id=store_setup["supplies_id"],
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.classification == StatementLineClassification.STORE_PURCHASE
    assert result.journal_entry_id is not None
    assert result.line.expense_entry_id is not None

    with entity_context(db_session, entity_id):
        journal = db_session.get(JournalEntry, result.journal_entry_id)
        assert journal is not None
        assert journal.source == JournalEntrySource.EXPENSE_ENTRY


def test_imported_migros_line_includes_store_suggestion(db_session, store_setup) -> None:
    entity_id = store_setup["entity_id"]
    csv = (
        "transaction_date,amount,description,reference\n"
        f'2026-07-05,"-450,00",{MIGROS_DESCRIPTION},MIG-2\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        store_setup["bank"].id,
        csv,
        original_filename="migros-suggest.csv",
    )

    line = statement.lines[0]
    assert line.suggestion is not None
    assert line.suggestion.classification == StatementLineClassification.STORE_PURCHASE
    assert line.suggestion.expense_account_id == store_setup["supplies_id"]
    assert line.status == StatementLineStatus.IMPORTED


def test_learned_store_purchase_auto_posts_on_import(db_session, store_setup) -> None:
    entity_id = store_setup["entity_id"]
    supplies_id = store_setup["supplies_id"]

    with entity_context(db_session, entity_id):
        for _ in range(HIGH_CONFIDENCE_THRESHOLD):
            learn_classification_rule(
                db_session,
                description=MIGROS_DESCRIPTION,
                classification=StatementLineClassification.STORE_PURCHASE,
                expense_account_id=supplies_id,
                match_token="MIGROS",
            )
        db_session.commit()

    csv = (
        "transaction_date,amount,description,reference\n"
        f'2026-07-06,"-320,00",{MIGROS_DESCRIPTION},MIG-AUTO\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        store_setup["bank"].id,
        csv,
        original_filename="migros-auto.csv",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.POSTED
        assert line.classification == StatementLineClassification.STORE_PURCHASE
        assert line.classification_source == StatementLineClassificationSource.RULE_AUTO.value
        assert line.expense_entry_id is not None
