"""Statement rule auto-apply — confidence threshold, correction, reversibility."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.subledger.control_account_tie import assert_entity_control_accounts_tied
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.classification_learning import (
    HIGH_CONFIDENCE_THRESHOLD,
    learn_classification_rule,
)
from app.features.banking.classification_rule_models import StatementClassificationRule
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
FEE_TOKEN = "bank service fee"


def _fee_csv(*, tx_date: str = "2026-03-01", description: str = "Bank service fee") -> bytes:
    return (
        "transaction_date,amount,description,reference\n"
        f'{tx_date},"-250,00",{description},FEE-{tx_date}\n'
    ).encode()


@pytest.fixture
def bank_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Auto Rule Bank",
            bank_name="Test",
        ),
    )
    return {"entity_id": restaurant_a.id, "bank": bank}


def _learn_fee_rule(
    db_session,
    entity_id: uuid.UUID,
    *,
    times: int = HIGH_CONFIDENCE_THRESHOLD,
    token: str = FEE_TOKEN,
) -> None:
    with entity_context(db_session, entity_id):
        for _ in range(times):
            learn_classification_rule(
                db_session,
                description=token,
                classification=StatementLineClassification.BANK_FEE,
                match_token=token,
            )
        db_session.commit()


def _import_fee(db_session, entity_id, bank_id, *, tx_date: str = "2026-03-01") -> uuid.UUID:
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_id,
        _fee_csv(tx_date=tx_date),
        original_filename=f"fee-{tx_date}.csv",
    )
    return statement.lines[0].id


def test_rule_auto_applies_only_at_high_threshold(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    _learn_fee_rule(db_session, entity_id, times=2)
    line_id = _import_fee(db_session, entity_id, bank_id, tx_date="2026-03-01")

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, line_id)
        assert line is not None
        assert line.status == StatementLineStatus.NEEDS_REVIEW
        assert line.journal_entry_id is None
        assert line.classification_source is None

    _learn_fee_rule(db_session, entity_id, times=1)
    line_id = _import_fee(db_session, entity_id, bank_id, tx_date="2026-03-02")

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, line_id)
        assert line is not None
        assert line.status == StatementLineStatus.POSTED
        assert line.classification_source == StatementLineClassificationSource.RULE_AUTO.value
        journal = db_session.get(JournalEntry, line.journal_entry_id)
        assert journal is not None
        assert journal.source == JournalEntrySource.RULE_AUTO


def test_classification_change_resets_confidence(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    _learn_fee_rule(db_session, entity_id, times=3)
    with entity_context(db_session, entity_id):
        learn_classification_rule(
            db_session,
            description=FEE_TOKEN,
            classification=StatementLineClassification.UNKNOWN,
            match_token=FEE_TOKEN,
        )
        db_session.commit()
        rule = db_session.scalar(select(StatementClassificationRule))
    assert rule is not None
    assert rule.confirmation_count == 1
    assert rule.classification == StatementLineClassification.UNKNOWN

    line_id = _import_fee(db_session, entity_id, bank_id, tx_date="2026-03-03")
    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, line_id)
        assert line is not None
        assert line.status == StatementLineStatus.NEEDS_REVIEW
        assert line.journal_entry_id is None


def test_correction_reverses_and_prevents_re_auto_apply(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    _learn_fee_rule(db_session, entity_id, times=3)
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_id,
        _fee_csv(tx_date="2026-03-04"),
        original_filename="fee-2026-03-04.csv",
    )
    line_id = statement.lines[0].id
    statement_id = statement.id

    with entity_context(db_session, entity_id):
        posted = db_session.get(BankStatementLine, line_id)
        assert posted is not None
        assert posted.status == StatementLineStatus.POSTED
        journal_id = posted.journal_entry_id

    statement_service.correct_statement_line(
        db_session,
        entity_id,
        statement_id,
        line_id,
        actor_id=ACTOR_ID,
        classification=StatementLineClassification.UNKNOWN,
        reason="Wrong classification",
    )

    with entity_context(db_session, entity_id):
        rule = db_session.scalar(select(StatementClassificationRule))
        assert rule is not None
        assert rule.correction_count >= 1
        assert rule.confirmations_since_correction < 3
        voided = db_session.get(JournalEntry, journal_id)
        assert voided is not None
        assert voided.status == JournalEntryStatus.VOIDED

    line_id_2 = _import_fee(db_session, entity_id, bank_id, tx_date="2026-03-05")
    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, line_id_2)
        assert line is not None
        assert line.status == StatementLineStatus.NEEDS_REVIEW
        assert line.journal_entry_id is None


def test_conflicting_rules_never_auto_apply(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    with entity_context(db_session, entity_id):
        for _ in range(3):
            learn_classification_rule(
                db_session,
                description="bank service",
                classification=StatementLineClassification.BANK_FEE,
                match_token="bank service",
            )
            learn_classification_rule(
                db_session,
                description="service fee",
                classification=StatementLineClassification.UNKNOWN,
                match_token="service fee",
            )
        db_session.commit()

    line_id = _import_fee(db_session, entity_id, bank_id, tx_date="2026-03-06")
    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, line_id)
        assert line is not None
        assert line.status == StatementLineStatus.NEEDS_REVIEW
        assert line.journal_entry_id is None


def test_entity_a_rule_never_auto_applies_in_entity_b(
    db_session, restaurant_a, restaurant_b, bank_setup
) -> None:
    _learn_fee_rule(db_session, bank_setup["entity_id"], times=3)
    seed_default_chart(db_session, restaurant_b.id)
    bank_b = banking_service.create_money_account(
        db_session,
        restaurant_b.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Entity B Bank",
            bank_name="Test",
        ),
    )
    line_id = _import_fee(db_session, restaurant_b.id, bank_b.id, tx_date="2026-03-07")
    with entity_context(db_session, restaurant_b.id):
        line = db_session.get(BankStatementLine, line_id)
        assert line is not None
        assert line.status == StatementLineStatus.IMPORTED
        assert line.journal_entry_id is None


def test_books_tie_after_auto_post_and_reversal(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    bank_id = bank_setup["bank"].id

    _learn_fee_rule(db_session, entity_id, times=3)
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_id,
        _fee_csv(tx_date="2026-03-08"),
        original_filename="fee-2026-03-08.csv",
    )
    with entity_context(db_session, entity_id):
        assert_entity_control_accounts_tied(db_session, entity_id)
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        auto_journal_id = line.journal_entry_id

    statement_service.correct_statement_line(
        db_session,
        entity_id,
        statement.id,
        statement.lines[0].id,
        actor_id=ACTOR_ID,
        classification=StatementLineClassification.UNKNOWN,
    )
    with entity_context(db_session, entity_id):
        assert_entity_control_accounts_tied(db_session, entity_id)
        original = db_session.get(JournalEntry, auto_journal_id)
        assert original is not None
        assert original.status == JournalEntryStatus.VOIDED
        assert original.reversed_by_entry_id is not None
