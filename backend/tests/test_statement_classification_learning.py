"""Statement classification learning — suggestions and learn-on-confirm guards."""

from __future__ import annotations

import uuid
from app.core.ledger.models import JournalEntry
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.expenses.normalize import normalize_expense_item_text
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.classification_learning import (
    learn_classification_rule,
    suggest_classification,
)
from app.features.banking.classification_rule_models import StatementClassificationRule
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.suppliers.models import Supplier

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "bank_statements"
SAMPLE_CSV = FIXTURES / "sample.csv"
ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def bank_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Learning Bank",
            bank_name="Test",
        ),
    )
    content = SAMPLE_CSV.read_bytes()
    statement = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank.id,
        content,
        original_filename="sample.csv",
    )
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "statement": statement,
    }


def _supplier(db_session, entity_id, *, name: str = "Metro", vkn: str = "1234567890") -> Supplier:
    with entity_context(db_session, entity_id):
        supplier = Supplier(name=name, vkn=vkn)
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        return supplier


def test_turkish_token_migros_matches_migros_tic_description(db_session, restaurant_a) -> None:
    with entity_context(db_session, restaurant_a.id):
        learn_classification_rule(
            db_session,
            description="MİGROS",
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            match_token="MİGROS",
        )
        db_session.commit()
        suggestion = suggest_classification(db_session, "HAVALE MİGROS TİC AŞ ÖDEME")
    assert suggestion is not None
    assert suggestion.classification == StatementLineClassification.SUPPLIER_PAYMENT
    assert normalize_expense_item_text("MİGROS") in normalize_expense_item_text(
        "HAVALE MİGROS TİC AŞ ÖDEME"
    )


def test_learning_upsert_increments_confirmation_count(
    db_session, restaurant_a, bank_setup
) -> None:
    supplier = _supplier(db_session, restaurant_a.id)
    line = bank_setup["statement"].lines[0]
    with entity_context(db_session, restaurant_a.id):
        learn_classification_rule(
            db_session,
            description=line.description,
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            supplier_id=supplier.id,
        )
        db_session.commit()
        learn_classification_rule(
            db_session,
            description=line.description,
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            supplier_id=supplier.id,
        )
        db_session.commit()
        count = db_session.scalar(
            select(func.count()).select_from(StatementClassificationRule)
        )
        rule = db_session.scalar(select(StatementClassificationRule))
    assert count == 1
    assert rule is not None
    assert rule.confirmation_count == 2


def test_rule_learned_in_entity_a_not_visible_in_entity_b(
    db_session, restaurant_a, restaurant_b
) -> None:
    with entity_context(db_session, restaurant_a.id):
        learn_classification_rule(
            db_session,
            description="MIGROS",
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            match_token="migros",
        )
        db_session.commit()
    with entity_context(db_session, restaurant_b.id):
        suggestion = suggest_classification(db_session, "MIGROS MARKET")
    assert suggestion is None


def test_suggestion_does_not_auto_post_or_change_needs_review_status(
    db_session, restaurant_a, bank_setup
) -> None:
    supplier = _supplier(db_session, restaurant_a.id)
    supplier_id = supplier.id
    entity_id = bank_setup["entity_id"]
    statement_id = bank_setup["statement"].id
    line_id = bank_setup["statement"].lines[0].id

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, line_id)
        assert line is not None
        line.status = StatementLineStatus.NEEDS_REVIEW
        line.classification = StatementLineClassification.SUPPLIER_PAYMENT
        line.supplier_id = supplier_id
        line.review_reason = "Near-match candidate"
        db_session.commit()

        learn_classification_rule(
            db_session,
            description=line.description,
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            supplier_id=supplier_id,
            match_token="metro",
        )
        db_session.commit()

        items, _ = statement_service.list_needs_review_statement_lines(
            db_session, entity_id
        )

    assert len(items) == 1
    review_line = items[0]
    assert review_line.status == StatementLineStatus.NEEDS_REVIEW
    assert review_line.journal_entry_id is None
    assert review_line.suggestion is not None
    assert review_line.suggestion.classification == StatementLineClassification.SUPPLIER_PAYMENT
    assert review_line.suggestion.supplier_id == supplier_id

    with entity_context(db_session, entity_id):
        journal_count = db_session.scalar(select(func.count()).select_from(JournalEntry))
    assert journal_count == 0


def test_classify_success_learns_rule(
    db_session, restaurant_a, bank_setup
) -> None:
    line_id = bank_setup["statement"].lines[1].id
    statement_service.classify_statement_line(
        db_session,
        restaurant_a.id,
        bank_setup["statement"].id,
        line_id,
        classification=StatementLineClassification.BANK_FEE,
        actor_id=ACTOR_ID,
    )
    with entity_context(db_session, restaurant_a.id):
        rule = db_session.scalar(select(StatementClassificationRule))
    assert rule is not None
    assert rule.confirmation_count == 1
    assert rule.classification == StatementLineClassification.BANK_FEE
    assert rule.supplier_id is None


def test_create_supplier_from_line_links_and_learns(
    db_session, restaurant_a, bank_setup
) -> None:
    line_id = bank_setup["statement"].lines[0].id
    result = statement_service.create_supplier_from_statement_line(
        db_session,
        restaurant_a.id,
        bank_setup["statement"].id,
        line_id,
        name="Yeni Tedarikci",
    )
    assert result.supplier_name == "Yeni Tedarikci"
    assert result.line.supplier_id == result.supplier_id
    assert result.line.journal_entry_id is None

    with entity_context(db_session, restaurant_a.id):
        rule = db_session.scalar(select(StatementClassificationRule))
    assert rule is not None
    assert rule.supplier_id == result.supplier_id


def test_conflicting_rules_return_no_suggestion(db_session, restaurant_a) -> None:
    with entity_context(db_session, restaurant_a.id):
        learn_classification_rule(
            db_session,
            description="metro",
            classification=StatementLineClassification.SUPPLIER_PAYMENT,
            match_token="metro",
        )
        learn_classification_rule(
            db_session,
            description="fee",
            classification=StatementLineClassification.BANK_FEE,
            match_token="fee",
        )
        db_session.commit()
        suggestion = suggest_classification(
            db_session, "Payment to Metro Gida fee adjustment"
        )
    assert suggestion is None
