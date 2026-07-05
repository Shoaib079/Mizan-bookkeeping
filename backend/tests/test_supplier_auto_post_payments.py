"""BSF-4 — per-supplier trusted auto-post on bank import."""

from __future__ import annotations

import uuid
from datetime import date

import pytest

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate, SupplierUpdate

METRO_DESCRIPTION = "HAVALE EFT METRO GIDA SAN TIC ODEME 20260701 REF999"


@pytest.fixture
def bank_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Trusted Auto Bank",
            bank_name="Test",
        ),
    )
    supplier = supplier_service.create_supplier(
        db_session,
        restaurant_a.id,
        SupplierCreate(name="Metro Gida San Tic Ltd", vkn="1234567890"),
    )
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "supplier": supplier,
    }


def _import_metro_payment(db_session, entity_id, bank_id):
    csv = (
        "transaction_date,amount,description,reference\n"
        f'2026-07-01,"-1.000,00",{METRO_DESCRIPTION},TRUST-1\n'
    ).encode()
    return statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_id,
        csv,
        original_filename="trusted-auto.csv",
    )


def test_trusted_supplier_auto_posts_without_learned_rule(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    supplier_id = bank_setup["supplier"].id

    supplier_service.update_supplier(
        db_session,
        entity_id,
        supplier_id,
        SupplierUpdate(auto_post_payments=True),
    )

    statement = _import_metro_payment(
        db_session, entity_id, bank_setup["bank"].id
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.POSTED
        assert line.classification == StatementLineClassification.SUPPLIER_PAYMENT
        assert line.supplier_id == supplier_id
        assert line.classification_source == StatementLineClassificationSource.RULE_AUTO.value
        journal = db_session.get(JournalEntry, line.journal_entry_id)
        assert journal is not None
        assert journal.source == JournalEntrySource.RULE_AUTO


def test_toggle_off_leaves_line_imported(db_session, bank_setup) -> None:
    statement = _import_metro_payment(
        db_session, bank_setup["entity_id"], bank_setup["bank"].id
    )

    with entity_context(db_session, bank_setup["entity_id"]):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.IMPORTED
        assert line.journal_entry_id is None


def test_trusted_supplier_large_advance_needs_review(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    supplier_id = bank_setup["supplier"].id

    supplier_service.update_supplier(
        db_session,
        entity_id,
        supplier_id,
        SupplierUpdate(auto_post_payments=True),
    )

    csv = (
        "transaction_date,amount,description,reference\n"
        f'2026-07-01,"-2.000,00",{METRO_DESCRIPTION},TRUST-LARGE\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_setup["bank"].id,
        csv,
        original_filename="trusted-large-advance.csv",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.NEEDS_REVIEW
        assert line.supplier_id == supplier_id
        assert line.review_reason == "Large supplier advance — confirm"
        assert line.journal_entry_id is None


def test_api_can_set_auto_post_toggle(client, restaurant_a, bank_setup) -> None:
    supplier_id = bank_setup["supplier"].id
    response = client.patch(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}",
        json={"auto_post_payments": True},
    )
    assert response.status_code == 200
    assert response.json()["auto_post_payments"] is True
