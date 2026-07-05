"""Getir / Yemeksepeti bank inflow → delivery_settlement path (money-critical)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.delivery import posting as delivery_posting
from app.core.learning import HIGH_CONFIDENCE_THRESHOLD
from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied
from app.db.session import entity_context
from app.features.banking import statements as statement_service
from app.features.banking.classification_learning import (
    evaluate_rule_match,
    learn_classification_rule,
    suggest_classification,
)
from app.features.banking.classification_rule_models import StatementClassificationRule
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)
from app.features.delivery.models import DeliverySettlement
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup

GETIR_INFLOW = "HAVALE GETIR YEMEK ODEME 20260215 REF11111111"
YS_INFLOW = "EFT YEMEKSEPETI ELEK ODEME 20260301 REF22222222"


@pytest.fixture
def delivery_bank_setup(db_session, restaurant_a):
    setup = build_delivery_setup(db_session, restaurant_a.id)
    setup["getir"] = setup["platforms"]["Getir"]
    setup["yemek"] = setup["platforms"]["Yemeksepeti"]
    return setup


def _import_inflow(
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


def _learn_getir_rule(
    db_session,
    entity_id: uuid.UUID,
    platform_id: uuid.UUID,
    *,
    times: int = 1,
) -> None:
    with entity_context(db_session, entity_id):
        for _ in range(times):
            learn_classification_rule(
                db_session,
                description=GETIR_INFLOW,
                classification=StatementLineClassification.DELIVERY_SETTLEMENT,
                delivery_platform_id=platform_id,
                counterparty_name="Getir",
            )
        db_session.commit()


def test_getir_inflow_links_existing_settlement_and_learns_platform(
    db_session, delivery_bank_setup
) -> None:
    entity_id = delivery_bank_setup["entity_id"]
    bank_id = delivery_bank_setup["bank"].id
    getir = delivery_bank_setup["getir"]

    manual = delivery_posting.post_delivery_settlement(
        db_session,
        entity_id,
        delivery_platform_id=getir.id,
        money_account_id=bank_id,
        settlement_date=date(2026, 2, 15),
        amount_kurus=360_000,
        description="Getir payout",
        actor_id=ACTOR_ID,
    )
    settlement_id = manual.delivery_settlement.id

    statement = _import_inflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-02-15",
        amount_lira="3.600,00",
        description=GETIR_INFLOW,
        reference="GETIR-LINK",
    )

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        statement.lines[0].id,
        classification=StatementLineClassification.DELIVERY_SETTLEMENT,
        delivery_platform_id=getir.id,
        actor_id=ACTOR_ID,
    )

    assert result.linked_existing_settlement is True
    assert result.line.status == StatementLineStatus.LINKED
    assert result.line.delivery_settlement_id == settlement_id

    with entity_context(db_session, entity_id):
        rule = db_session.scalar(select(StatementClassificationRule))
        assert rule is not None
        assert rule.classification == StatementLineClassification.DELIVERY_SETTLEMENT
        assert rule.delivery_platform_id == getir.id
        assert "getir" in rule.match_token


def test_second_getir_inflow_auto_applies_learned_platform(
    db_session, delivery_bank_setup
) -> None:
    entity_id = delivery_bank_setup["entity_id"]
    bank_id = delivery_bank_setup["bank"].id
    getir = delivery_bank_setup["getir"]

    _learn_getir_rule(
        db_session, entity_id, getir.id, times=HIGH_CONFIDENCE_THRESHOLD
    )

    with entity_context(db_session, entity_id):
        evaluation = evaluate_rule_match(db_session, GETIR_INFLOW)
        assert evaluation.high_confidence is True
        assert evaluation.suggestion is not None
        assert evaluation.suggestion.delivery_platform_id == getir.id

    statement = _import_inflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-02-16",
        amount_lira="2.500,00",
        description=GETIR_INFLOW,
        reference="GETIR-AUTO",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.POSTED
        assert line.classification == StatementLineClassification.DELIVERY_SETTLEMENT
        assert line.classification_source == StatementLineClassificationSource.RULE_AUTO.value
        assert line.delivery_settlement_id is not None
        settlement = db_session.get(DeliverySettlement, line.delivery_settlement_id)
        assert settlement is not None
        assert settlement.delivery_platform_id == getir.id
        assert settlement.amount_kurus == 250_000
        assert_entity_control_accounts_tied(db_session, entity_id)


def test_yemeksepeti_inflow_does_not_link_to_getir(
    db_session, delivery_bank_setup
) -> None:
    entity_id = delivery_bank_setup["entity_id"]
    bank_id = delivery_bank_setup["bank"].id
    getir = delivery_bank_setup["getir"]
    yemek = delivery_bank_setup["yemek"]

    delivery_posting.post_delivery_settlement(
        db_session,
        entity_id,
        delivery_platform_id=getir.id,
        money_account_id=bank_id,
        settlement_date=date(2026, 3, 1),
        amount_kurus=180_000,
        description="Getir payout",
        actor_id=ACTOR_ID,
    )
    yemek_settlement = delivery_posting.post_delivery_settlement(
        db_session,
        entity_id,
        delivery_platform_id=yemek.id,
        money_account_id=bank_id,
        settlement_date=date(2026, 3, 1),
        amount_kurus=180_000,
        description="Yemek payout",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        for _ in range(HIGH_CONFIDENCE_THRESHOLD):
            learn_classification_rule(
                db_session,
                description=YS_INFLOW,
                classification=StatementLineClassification.DELIVERY_SETTLEMENT,
                delivery_platform_id=yemek.id,
                counterparty_name=yemek.name,
            )
        db_session.commit()

    statement = _import_inflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-03-01",
        amount_lira="1.800,00",
        description=YS_INFLOW,
        reference="YS-LINK",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.LINKED
        assert line.delivery_settlement_id == yemek_settlement.delivery_settlement.id
        settlement = db_session.get(DeliverySettlement, line.delivery_settlement_id)
        assert settlement is not None
        assert settlement.delivery_platform_id == yemek.id
        assert settlement.delivery_platform_id != getir.id


def test_inflow_without_settlement_routes_to_actionable_needs_review(
    db_session, delivery_bank_setup
) -> None:
    entity_id = delivery_bank_setup["entity_id"]
    bank_id = delivery_bank_setup["bank"].id

    with entity_context(db_session, entity_id):
        for _ in range(HIGH_CONFIDENCE_THRESHOLD):
            learn_classification_rule(
                db_session,
                description=GETIR_INFLOW,
                classification=StatementLineClassification.DELIVERY_SETTLEMENT,
                match_token="getir yemek",
            )
        db_session.commit()

    statement = _import_inflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-04-01",
        amount_lira="1.000,00",
        description=GETIR_INFLOW,
        reference="GETIR-NOMATCH",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.NEEDS_REVIEW
        assert line.delivery_settlement_id is None
        assert line.review_reason is not None
        assert "classify manually" in line.review_reason.lower()
        assert "platform" in line.review_reason.lower()


def test_needs_review_getir_inflow_manual_classify_creates_settlement(
    db_session, delivery_bank_setup
) -> None:
    """Owner can post a stuck needs_review delivery inflow — re-classify must stick."""
    entity_id = delivery_bank_setup["entity_id"]
    bank_id = delivery_bank_setup["bank"].id
    getir = delivery_bank_setup["getir"]

    statement = _import_inflow(
        db_session,
        entity_id,
        bank_id,
        tx_date="2026-04-02",
        amount_lira="950,00",
        description=GETIR_INFLOW,
        reference="GETIR-MANUAL",
    )
    line_id = statement.lines[0].id

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, line_id)
        assert line is not None
        line.status = StatementLineStatus.NEEDS_REVIEW.value
        line.classification = StatementLineClassification.DELIVERY_SETTLEMENT.value
        line.review_reason = (
            "No delivery settlement on file for this platform, amount, and date — "
            "classify manually and pick the delivery platform to record the deposit"
        )
        db_session.commit()

        count_before = (
            db_session.scalar(select(func.count()).select_from(DeliverySettlement)) or 0
        )

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.DELIVERY_SETTLEMENT,
        delivery_platform_id=getir.id,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.delivery_settlement_id is not None
    assert result.journal_entry_id is not None

    with entity_context(db_session, entity_id):
        count_after = (
            db_session.scalar(select(func.count()).select_from(DeliverySettlement)) or 0
        )
        assert count_after == count_before + 1
        suggestion = suggest_classification(db_session, GETIR_INFLOW)
        assert suggestion is not None
        assert suggestion.classification == StatementLineClassification.DELIVERY_SETTLEMENT
        assert suggestion.delivery_platform_id == getir.id
