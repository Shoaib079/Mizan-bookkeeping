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
    derive_stable_bank_description_token,
    derive_statement_match_token,
    evaluate_rule_match,
    is_high_confidence,
    learn_classification_rule,
    suggest_classification,
    _bank_match_key,
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


def test_classify_with_match_token_keys_rule_on_trimmed_token(
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
        match_token="MIGROS",
    )
    with entity_context(db_session, restaurant_a.id):
        rule = db_session.scalar(select(StatementClassificationRule))
        suggestion = suggest_classification(db_session, "HAVALE MIGROS TIC AS ODEME")
    assert rule is not None
    assert rule.match_token == _bank_match_key("MIGROS")
    assert suggestion is not None
    assert suggestion.classification == StatementLineClassification.BANK_FEE


def test_correct_with_match_token_relearns_on_trimmed_token(
    db_session, restaurant_a, bank_setup
) -> None:
    line_id = bank_setup["statement"].lines[1].id
    statement_id = bank_setup["statement"].id
    statement_service.classify_statement_line(
        db_session,
        restaurant_a.id,
        statement_id,
        line_id,
        classification=StatementLineClassification.BANK_FEE,
        actor_id=ACTOR_ID,
    )
    statement_service.correct_statement_line(
        db_session,
        restaurant_a.id,
        statement_id,
        line_id,
        actor_id=ACTOR_ID,
        classification=StatementLineClassification.UNKNOWN,
        reason="Wrong fee classification",
        match_token="service fee",
    )
    with entity_context(db_session, restaurant_a.id):
        rule = db_session.scalar(
            select(StatementClassificationRule).where(
                StatementClassificationRule.match_token
                == normalize_expense_item_text("service fee")
            )
        )
        suggestion = suggest_classification(db_session, "Monthly service fee charge")
    assert rule is not None
    assert rule.classification == StatementLineClassification.UNKNOWN
    assert suggestion is not None
    assert suggestion.classification == StatementLineClassification.UNKNOWN


def test_derive_stable_token_strips_dates_refs_and_bank_noise() -> None:
    desc = "HAVALE EFT METRO GIDA SAN TIC ODEME 28.02.2026 REF12345678 1500,00 TL"
    token = derive_stable_bank_description_token(desc)
    assert token == "metro gida san tic"
    assert "12345678" not in token
    assert "2026" not in token
    assert "odeme" not in token


def test_supplier_payments_with_different_refs_share_one_rule_and_reach_high(
    db_session, restaurant_a
) -> None:
    supplier = _supplier(
        db_session,
        restaurant_a.id,
        name="Metro Gida San Tic Ltd",
    )
    descriptions = [
        "HAVALE EFT METRO GIDA SAN TIC ODEME 20260215 REF12345678",
        "HAVALE EFT METRO GIDA SAN TIC ODEME 20260301 REF87654321",
        "FAST METRO GIDA SAN TIC 20260401 REF11112222",
    ]
    with entity_context(db_session, restaurant_a.id):
        for desc in descriptions:
            learn_classification_rule(
                db_session,
                description=desc,
                classification=StatementLineClassification.SUPPLIER_PAYMENT,
                supplier_id=supplier.id,
                counterparty_name=supplier.name,
            )
        rule = db_session.scalar(select(StatementClassificationRule))
        assert rule is not None
        assert rule.confirmation_count == 3
        assert is_high_confidence(rule)
        assert "12345678" not in rule.match_token
        assert "metro gida" in rule.match_token

        fourth = "EFT METRO GIDA SAN TIC ODEME 20260501 REF99998888"
        evaluation = evaluate_rule_match(db_session, fourth)
        assert evaluation.high_confidence is True
        assert evaluation.suggestion is not None
        assert evaluation.suggestion.supplier_id == supplier.id


def test_delivery_platform_payments_share_stable_token(
    db_session, restaurant_a
) -> None:
    from tests.delivery_helpers import create_platform, delivery_setup

    delivery_setup(db_session, restaurant_a.id)
    platform = create_platform(db_session, restaurant_a.id, "Getir Yemek")
    descriptions = [
        "HAVALE GETIR YEMEK ODEME 20260215 REF11111111",
        "EFT GETIR YEMEK TRANSFER 20260301 REF22222222",
        "FAST GETIR YEMEK 20260401 REF33333333",
    ]
    with entity_context(db_session, restaurant_a.id):
        for desc in descriptions:
            learn_classification_rule(
                db_session,
                description=desc,
                classification=StatementLineClassification.DELIVERY_SETTLEMENT,
                delivery_platform_id=platform.id,
                counterparty_name=platform.name,
            )
        rule = db_session.scalar(select(StatementClassificationRule))
        assert rule is not None
        assert rule.confirmation_count == 3
        assert rule.delivery_platform_id == platform.id
        assert is_high_confidence(rule)
        assert "getir yemek" in rule.match_token


def test_learn_and_match_use_same_token_for_supplier_payments() -> None:
    descriptions = [
        "HAVALE EFT METRO GIDA SAN TIC ODEME 20260215 REF12345678",
        "FAST METRO GIDA SAN TIC 20260401 REF11112222",
    ]
    tokens = [
        derive_statement_match_token(
            desc,
            counterparty_name="Metro Gida San Tic Ltd",
        )
        for desc in descriptions
    ]
    assert tokens[0] == tokens[1]
    assert tokens[0] is not None
    assert "metro gida" in tokens[0]


def test_manual_match_token_override_not_replaced_by_stable_derivation() -> None:
    desc = "HAVALE EFT METRO GIDA SAN TIC ODEME 20260215 REF12345678"
    token = derive_statement_match_token(
        desc,
        match_token="MIGROS",
        counterparty_name="Metro Gida San Tic Ltd",
    )
    assert token == _bank_match_key("MIGROS").replace("ı", "i")
