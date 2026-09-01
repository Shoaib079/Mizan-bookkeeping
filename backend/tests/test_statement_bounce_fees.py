"""Net fee helpers for payment bounce pairs."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.db.session import entity_context
from app.features.banking.statement_bounce import BouncePairError, record_payment_bounce
from app.features.banking.statement_bounce_fees import net_fee_kurus
from app.features.banking.statement_models import (
    BankStatementLine,
    BouncePersonType,
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.banking.statement_settled import statement_line_is_settled
from tests.test_statement_bounce_pair import ACTOR_ID

pytest_plugins = ("tests.test_statement_bounce_pair",)


def test_net_fee_kurus_sums_charges_and_refunds() -> None:
    lines = [
        BankStatementLine(amount_kurus=-1_676),
        BankStatementLine(amount_kurus=1_526),
        BankStatementLine(amount_kurus=74),
        BankStatementLine(amount_kurus=76),
    ]
    assert net_fee_kurus(lines) == 0


def test_bounce_net_fee_zero_posts_no_journal(db_session, bounce_setup) -> None:
    entity_id = bounce_setup["entity_id"]
    supplier_id = bounce_setup["supplier_id"]

    with entity_context(db_session, entity_id):
        fee = db_session.get(BankStatementLine, bounce_setup["fee_id"])
        assert fee is not None
        fee.amount_kurus = -1_676
        refund_lines = [
            BankStatementLine(
                statement_id=bounce_setup["statement_id"],
                transaction_date=date(2026, 2, 2),
                description="Fee refund 1",
                amount_kurus=1_526,
                dedup_key=uuid.uuid4().hex,
            ),
            BankStatementLine(
                statement_id=bounce_setup["statement_id"],
                transaction_date=date(2026, 2, 2),
                description="Fee refund 2",
                amount_kurus=74,
                dedup_key=uuid.uuid4().hex,
            ),
            BankStatementLine(
                statement_id=bounce_setup["statement_id"],
                transaction_date=date(2026, 2, 2),
                description="Fee refund 3",
                amount_kurus=76,
                dedup_key=uuid.uuid4().hex,
            ),
        ]
        db_session.add_all(refund_lines)
        db_session.commit()
        refund_ids = [line.id for line in refund_lines]

    result = record_payment_bounce(
        db_session,
        entity_id,
        bounce_setup["statement_id"],
        outflow_line_id=bounce_setup["outflow_id"],
        return_line_id=bounce_setup["return_id"],
        person_type=BouncePersonType.SUPPLIER,
        person_id=supplier_id,
        fee_line_id=None,
        fee_line_ids=[bounce_setup["fee_id"], *refund_ids],
        actor_id=ACTOR_ID,
    )

    assert result.fee_journal_entry_id is None
    fee_lines = [
        line
        for line in result.lines
        if line.id not in {bounce_setup["outflow_id"], bounce_setup["return_id"]}
    ]
    assert len(fee_lines) == 4
    assert all(
        line.classification == StatementLineClassification.PAYMENT_BOUNCED
        for line in fee_lines
    )
    assert all(line.status == StatementLineStatus.CLASSIFIED for line in fee_lines)

    with entity_context(db_session, entity_id):
        lines = list(
            db_session.scalars(
                select(BankStatementLine).where(
                    BankStatementLine.statement_id == bounce_setup["statement_id"]
                )
            )
        )
        assert all(statement_line_is_settled(line) for line in lines)


def test_bounce_net_fee_posts_remaining_charge(db_session, bounce_setup) -> None:
    entity_id = bounce_setup["entity_id"]
    supplier_id = bounce_setup["supplier_id"]

    with entity_context(db_session, entity_id):
        fee = db_session.get(BankStatementLine, bounce_setup["fee_id"])
        assert fee is not None
        fee.amount_kurus = -1_676
        refund = BankStatementLine(
            statement_id=bounce_setup["statement_id"],
            transaction_date=date(2026, 2, 2),
            description="Partial refund",
            amount_kurus=1_526,
            dedup_key=uuid.uuid4().hex,
        )
        db_session.add(refund)
        db_session.commit()
        refund_id = refund.id

    result = record_payment_bounce(
        db_session,
        entity_id,
        bounce_setup["statement_id"],
        outflow_line_id=bounce_setup["outflow_id"],
        return_line_id=bounce_setup["return_id"],
        person_type=BouncePersonType.SUPPLIER,
        person_id=supplier_id,
        fee_line_ids=[bounce_setup["fee_id"], refund_id],
        actor_id=ACTOR_ID,
    )

    assert result.fee_journal_entry_id is not None
    posted = next(line for line in result.lines if line.id == bounce_setup["fee_id"])
    assert posted.classification == StatementLineClassification.BANK_FEE
    assert posted.status == StatementLineStatus.POSTED
    refund_line = next(line for line in result.lines if line.id == refund_id)
    assert refund_line.classification == StatementLineClassification.PAYMENT_BOUNCED


def test_bounce_with_manual_net_fee(db_session, bounce_setup) -> None:
    entity_id = bounce_setup["entity_id"]
    supplier_id = bounce_setup["supplier_id"]

    result = record_payment_bounce(
        db_session,
        entity_id,
        bounce_setup["statement_id"],
        outflow_line_id=bounce_setup["outflow_id"],
        return_line_id=bounce_setup["return_id"],
        person_type=BouncePersonType.SUPPLIER,
        person_id=supplier_id,
        fee_line_ids=[],
        manual_net_fee_kurus=-250_00,
        actor_id=ACTOR_ID,
    )

    assert result.fee_journal_entry_id is not None
    assert len(result.lines) == 2


def test_bounce_rejects_manual_fee_with_fee_lines(db_session, bounce_setup) -> None:
    entity_id = bounce_setup["entity_id"]
    supplier_id = bounce_setup["supplier_id"]

    with pytest.raises(BouncePairError, match="not both"):
        record_payment_bounce(
            db_session,
            entity_id,
            bounce_setup["statement_id"],
            outflow_line_id=bounce_setup["outflow_id"],
            return_line_id=bounce_setup["return_id"],
            person_type=BouncePersonType.SUPPLIER,
            person_id=supplier_id,
            fee_line_ids=[bounce_setup["fee_id"]],
            manual_net_fee_kurus=-250_00,
            actor_id=ACTOR_ID,
        )


def test_bounce_rejects_posted_fee_line(db_session, bounce_setup) -> None:
    entity_id = bounce_setup["entity_id"]
    supplier_id = bounce_setup["supplier_id"]

    with entity_context(db_session, entity_id):
        fee = db_session.get(BankStatementLine, bounce_setup["fee_id"])
        assert fee is not None
        fee.status = StatementLineStatus.POSTED

    with pytest.raises(BouncePairError, match="already posted"):
        record_payment_bounce(
            db_session,
            entity_id,
            bounce_setup["statement_id"],
            outflow_line_id=bounce_setup["outflow_id"],
            return_line_id=bounce_setup["return_id"],
            person_type=BouncePersonType.SUPPLIER,
            person_id=supplier_id,
            fee_line_ids=[bounce_setup["fee_id"]],
            actor_id=ACTOR_ID,
        )
