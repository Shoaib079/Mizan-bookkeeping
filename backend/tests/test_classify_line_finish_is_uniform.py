"""What every classification does after it posts, and did not do the same way.

`classify_statement_line` ended twenty-two branches with the same forty lines:
reload the line, mark it posted, record a learned rule, build the result. They
were copies. Reading them side by side to collapse them is what surfaced the
two differences below — neither of which was findable while they sat 300 lines
apart.

Both are pinned here rather than described in a comment, because a shared tail
that quietly stops setting a field looks exactly like one that never did.
"""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.classification_rule_models import StatementClassificationRule
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    StatementLineClassification,
    StatementLineClassificationSource,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "bank_statements"
SAMPLE_CSV = FIXTURES / "sample.csv"
ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

#: "Other Income" in the default chart. A literal because the chart names
#: no constant for it — `lib/account-codes.ts` and `default_chart.py` only
#: export the codes something in the app has needed to reference by name.
OTHER_INCOME_CODE = "4100"


@pytest.fixture
def bank_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Uniformity Bank",
            bank_name="Test",
        ),
    )
    statement = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank.id,
        SAMPLE_CSV.read_bytes(),
        original_filename="sample.csv",
    )
    return {"bank": bank, "statement": statement}


def _outflow_line(bank_setup):
    """A negative line — bank charges and most expense kinds require one."""
    return next(
        line for line in bank_setup["statement"].lines if line.amount_kurus < 0
    )


def _inflow_line(bank_setup):
    return next(
        line for line in bank_setup["statement"].lines if line.amount_kurus > 0
    )


def _rules(db_session, entity_id) -> list[StatementClassificationRule]:
    with entity_context(db_session, entity_id):
        return list(db_session.scalars(select(StatementClassificationRule)))


class TestClassificationSource:
    """Two of twenty-two set it. Now all of them do.

    Nothing was broken: every reader compares against `"rule_auto"`, so NULL
    and `"manual"` behave identically. The cost was latent — the natural thing
    for the next person to write is `== "manual"`, and twenty classifications
    would have fallen silently outside it, which is a filter that excludes
    nothing wearing the appearance of one that works.
    """

    def test_a_bank_fee_records_that_a_person_classified_it(
        self, db_session, restaurant_a, bank_setup
    ):
        result = statement_service.classify_statement_line(
            db_session,
            restaurant_a.id,
            bank_setup["statement"].id,
            _outflow_line(bank_setup).id,
            classification=StatementLineClassification.BANK_FEE,
            actor_id=ACTOR_ID,
        )
        assert (
            result.line.classification_source
            == StatementLineClassificationSource.MANUAL.value
        )

    def test_so_does_a_kind_that_never_used_to(
        self, db_session, restaurant_a, bank_setup
    ):
        # Other income was one of the twenty that left this NULL.
        with entity_context(db_session, restaurant_a.id):
            income = db_session.scalar(
                select(Account).where(Account.code == OTHER_INCOME_CODE)
            )
            assert income is not None
            income_id = income.id

        result = statement_service.classify_statement_line(
            db_session,
            restaurant_a.id,
            bank_setup["statement"].id,
            _inflow_line(bank_setup).id,
            classification=StatementLineClassification.OTHER_INCOME,
            income_account_id=income_id,
            actor_id=ACTOR_ID,
        )
        assert (
            result.line.classification_source
            == StatementLineClassificationSource.MANUAL.value
        )


class TestOtherIncomeLearns:
    """It was the only classification that taught the app nothing.

    A learned rule that is not auto-postable is still used: the next matching
    line arrives in the review queue already labelled. So this was the
    difference between remembering a recurring rent *payment* and forgetting
    the rent *receipt* beside it — invisible unless you happened to classify
    the same income twice and notice it was never offered.
    """

    def test_classifying_income_learns_a_rule(
        self, db_session, restaurant_a, bank_setup
    ):
        with entity_context(db_session, restaurant_a.id):
            income_id = db_session.scalar(
                select(Account).where(Account.code == OTHER_INCOME_CODE)
            ).id

        assert _rules(db_session, restaurant_a.id) == []

        statement_service.classify_statement_line(
            db_session,
            restaurant_a.id,
            bank_setup["statement"].id,
            _inflow_line(bank_setup).id,
            classification=StatementLineClassification.OTHER_INCOME,
            income_account_id=income_id,
            actor_id=ACTOR_ID,
        )

        rules = _rules(db_session, restaurant_a.id)
        assert len(rules) == 1
        assert rules[0].classification == StatementLineClassification.OTHER_INCOME

    def test_it_learns_no_account(self, db_session, restaurant_a, bank_setup):
        """Deliberate, not an oversight.

        The rule's account column is named `expense_account_id` and is only
        read when auto-posting a store purchase. Income is never auto-posted,
        so an account stored there would be used by nothing and would make the
        column's name a lie.
        """
        with entity_context(db_session, restaurant_a.id):
            income_id = db_session.scalar(
                select(Account).where(Account.code == OTHER_INCOME_CODE)
            ).id

        statement_service.classify_statement_line(
            db_session,
            restaurant_a.id,
            bank_setup["statement"].id,
            _inflow_line(bank_setup).id,
            classification=StatementLineClassification.OTHER_INCOME,
            income_account_id=income_id,
            actor_id=ACTOR_ID,
        )

        rules = _rules(db_session, restaurant_a.id)
        assert rules[0].expense_account_id is None
        assert rules[0].supplier_id is None
