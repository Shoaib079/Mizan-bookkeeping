"""BSF-3 — supplier suggestion on imported/review bank lines."""

from __future__ import annotations

import uuid

import pytest

from app.core.chart_of_accounts.seed import seed_default_chart
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import StatementLineClassification
from app.features.banking.supplier_suggest_service import suggest_line_classification
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate


@pytest.fixture
def bank_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Suggest Bank",
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


def test_imported_outflow_includes_supplier_suggestion(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id
    supplier_id = bank_setup["supplier"].id

    csv = (
        "transaction_date,amount,description,reference\n"
        "2026-06-01,\"-1.000,00\",HAVALE EFT METRO GIDA SAN TIC ODEME 20260601 REF1,REF1\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_id,
        csv,
        original_filename="metro-suggest.csv",
    )
    line = statement.lines[0]
    assert line.suggestion is not None
    assert line.suggestion.classification == StatementLineClassification.SUPPLIER_PAYMENT
    assert line.suggestion.supplier_id == supplier_id
    assert line.status == "imported"


def test_learned_rule_takes_priority_over_name_match(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    from app.features.banking.classification_learning import learn_classification_rule

    with entity_context(db_session, entity_id):
        for _ in range(3):
            learn_classification_rule(
                db_session,
                description="HAVALE EFT METRO GIDA SAN TIC ODEME",
                classification=StatementLineClassification.SUPPLIER_PAYMENT,
                supplier_id=bank_setup["supplier"].id,
                match_token="metro gida",
            )
        db_session.commit()

    with entity_context(db_session, entity_id):
        suggestion = suggest_line_classification(
            db_session,
            entity_id,
            "HAVALE EFT METRO GIDA SAN TIC ODEME",
            amount_kurus=-100_000,
        )
    assert suggestion is not None
    assert "learned token" in suggestion.reason.lower()
