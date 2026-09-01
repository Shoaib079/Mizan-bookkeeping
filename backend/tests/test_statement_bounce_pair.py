"""Payment bounce pairs on bank statements."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import BANK_CHARGES_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.ledger.correction import void_supplier_payment
from app.core.ledger.models import JournalEntry
from app.core.payables import posting as payables_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_bounce import BouncePairError, record_payment_bounce
from app.features.banking.statement_closing import effective_stated_closing_balance_kurus
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
    BouncePersonType,
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.banking.statement_settled import statement_line_is_settled
from app.features.suppliers.models import Supplier

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return restaurant_a.id


def _bank_account(db_session, entity_id):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )


def _supplier(db_session, entity_id) -> uuid.UUID:
    with entity_context(db_session, entity_id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        return supplier.id


def _statement_with_bounce_lines(
    db_session,
    entity_id,
    *,
    money_account_id: uuid.UUID,
    payment_kurus: int = 5_000_000,
    fee_kurus: int = 250_00,
) -> dict:
    with entity_context(db_session, entity_id):
        statement = BankStatement(
            money_account_id=money_account_id,
            file_fingerprint=uuid.uuid4().hex,
            period_start=date(2026, 2, 1),
            period_end=date(2026, 2, 28),
            original_filename="bounce-test.csv",
            line_count=3,
            closing_balance_kurus=0,
        )
        db_session.add(statement)
        db_session.flush()

        outflow = BankStatementLine(
            statement_id=statement.id,
            transaction_date=date(2026, 2, 1),
            description="Payment to Metro",
            amount_kurus=-payment_kurus,
            dedup_key=uuid.uuid4().hex,
        )
        return_line = BankStatementLine(
            statement_id=statement.id,
            transaction_date=date(2026, 2, 2),
            description="Payment returned",
            amount_kurus=payment_kurus,
            dedup_key=uuid.uuid4().hex,
        )
        fee = BankStatementLine(
            statement_id=statement.id,
            transaction_date=date(2026, 2, 2),
            description="Bounce fee",
            amount_kurus=-fee_kurus,
            dedup_key=uuid.uuid4().hex,
        )
        db_session.add_all([outflow, return_line, fee])
        db_session.commit()
        return {
            "statement_id": statement.id,
            "outflow_id": outflow.id,
            "return_id": return_line.id,
            "fee_id": fee.id,
        }


@pytest.fixture
def bounce_setup(db_session, restaurant_a, seeded_accounts):
    bank = _bank_account(db_session, restaurant_a.id)
    supplier_id = _supplier(db_session, restaurant_a.id)
    lines = _statement_with_bounce_lines(
        db_session, restaurant_a.id, money_account_id=bank.id
    )
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "supplier_id": supplier_id,
        **lines,
    }


def test_bounce_never_posted(db_session, bounce_setup) -> None:
    result = record_payment_bounce(
        db_session,
        bounce_setup["entity_id"],
        bounce_setup["statement_id"],
        outflow_line_id=bounce_setup["outflow_id"],
        return_line_id=bounce_setup["return_id"],
        person_type=BouncePersonType.SUPPLIER,
        person_id=bounce_setup["supplier_id"],
        fee_line_id=None,
        actor_id=ACTOR_ID,
    )
    assert all(line.classification == StatementLineClassification.PAYMENT_BOUNCED for line in result.lines)


def test_bounce_pair_happy_path_after_void(db_session, bounce_setup) -> None:
    entity_id = bounce_setup["entity_id"]
    supplier_id = bounce_setup["supplier_id"]

    payment = payables_posting.post_supplier_payment(
        db_session,
        entity_id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=5_000_000,
        description="Payment to Metro",
        actor_id=ACTOR_ID,
        payment_account_id=bounce_setup["bank"].gl_account_id,
        skip_advance_confirm=True,
    )
    void_supplier_payment(
        db_session,
        entity_id,
        payment.journal_entry.id,
        actor_id=ACTOR_ID,
        reason="bounced",
    )

    result = record_payment_bounce(
        db_session,
        entity_id,
        bounce_setup["statement_id"],
        outflow_line_id=bounce_setup["outflow_id"],
        return_line_id=bounce_setup["return_id"],
        person_type=BouncePersonType.SUPPLIER,
        person_id=supplier_id,
        fee_line_id=None,
        actor_id=ACTOR_ID,
    )

    assert len(result.lines) == 2
    for line in result.lines:
        assert line.classification == StatementLineClassification.PAYMENT_BOUNCED
        assert line.status == StatementLineStatus.CLASSIFIED
        assert line.journal_entry_id is None
        assert line.bounce_pair_id is not None

    with entity_context(db_session, entity_id):
        journal_count = db_session.scalar(select(func.count()).select_from(JournalEntry))
    assert journal_count == 2


def test_bounce_pair_posts_fee(db_session, bounce_setup) -> None:
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
        fee_line_id=bounce_setup["fee_id"],
        actor_id=ACTOR_ID,
    )

    assert result.fee_journal_entry_id is not None
    fee_line = next(line for line in result.lines if line.id == bounce_setup["fee_id"])
    assert fee_line.classification == StatementLineClassification.BANK_FEE
    assert fee_line.status == StatementLineStatus.POSTED

    with entity_context(db_session, entity_id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        fee_lines = db_session.scalars(
            select(JournalEntry).where(JournalEntry.id == result.fee_journal_entry_id)
        ).all()
    assert fee_lines
    assert accounts[BANK_CHARGES_CODE]


def test_bounce_orphan_payment_requires_auto_void(db_session, bounce_setup) -> None:
    entity_id = bounce_setup["entity_id"]
    supplier_id = bounce_setup["supplier_id"]

    payables_posting.post_supplier_payment(
        db_session,
        entity_id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=5_000_000,
        description="Payment to Metro",
        actor_id=ACTOR_ID,
        payment_account_id=bounce_setup["bank"].gl_account_id,
        skip_advance_confirm=True,
    )

    with pytest.raises(BouncePairError, match="Confirm auto-void"):
        record_payment_bounce(
            db_session,
            entity_id,
            bounce_setup["statement_id"],
            outflow_line_id=bounce_setup["outflow_id"],
            return_line_id=bounce_setup["return_id"],
            person_type=BouncePersonType.SUPPLIER,
            person_id=supplier_id,
            fee_line_id=None,
            actor_id=ACTOR_ID,
            auto_void_confirmed=False,
        )


def test_bounce_auto_voids_orphan_payment(db_session, bounce_setup) -> None:
    entity_id = bounce_setup["entity_id"]
    supplier_id = bounce_setup["supplier_id"]

    payables_posting.post_supplier_payment(
        db_session,
        entity_id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=5_000_000,
        description="Payment to Metro",
        actor_id=ACTOR_ID,
        payment_account_id=bounce_setup["bank"].gl_account_id,
        skip_advance_confirm=True,
    )

    result = record_payment_bounce(
        db_session,
        entity_id,
        bounce_setup["statement_id"],
        outflow_line_id=bounce_setup["outflow_id"],
        return_line_id=bounce_setup["return_id"],
        person_type=BouncePersonType.SUPPLIER,
        person_id=supplier_id,
        fee_line_id=None,
        actor_id=ACTOR_ID,
        auto_void_confirmed=True,
    )

    assert result.pair.voided_journal_entry_id is not None
    for line in result.lines:
        assert line.classification == StatementLineClassification.PAYMENT_BOUNCED


def test_bounce_auto_voids_posted_outflow(db_session, bounce_setup) -> None:
    entity_id = bounce_setup["entity_id"]
    supplier_id = bounce_setup["supplier_id"]

    statement_service.classify_statement_line(
        db_session,
        entity_id,
        bounce_setup["statement_id"],
        bounce_setup["outflow_id"],
        classification=StatementLineClassification.SUPPLIER_PAYMENT,
        supplier_id=supplier_id,
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        outflow = db_session.get(BankStatementLine, bounce_setup["outflow_id"])
        assert outflow is not None
        assert outflow.status == StatementLineStatus.POSTED
        assert outflow.journal_entry_id is not None

    with pytest.raises(BouncePairError, match="Confirm auto-void"):
        record_payment_bounce(
            db_session,
            entity_id,
            bounce_setup["statement_id"],
            outflow_line_id=bounce_setup["outflow_id"],
            return_line_id=bounce_setup["return_id"],
            person_type=BouncePersonType.SUPPLIER,
            person_id=supplier_id,
            fee_line_id=None,
            actor_id=ACTOR_ID,
            auto_void_confirmed=False,
        )

    result = record_payment_bounce(
        db_session,
        entity_id,
        bounce_setup["statement_id"],
        outflow_line_id=bounce_setup["outflow_id"],
        return_line_id=bounce_setup["return_id"],
        person_type=BouncePersonType.SUPPLIER,
        person_id=supplier_id,
        fee_line_id=None,
        actor_id=ACTOR_ID,
        auto_void_confirmed=True,
    )

    assert result.pair.voided_journal_entry_id is not None
    outflow_line = next(line for line in result.lines if line.id == bounce_setup["outflow_id"])
    assert outflow_line.status == StatementLineStatus.CLASSIFIED
    assert outflow_line.classification == StatementLineClassification.PAYMENT_BOUNCED


def test_bounce_classified_unknown_outflow(db_session, bounce_setup) -> None:
    with entity_context(db_session, bounce_setup["entity_id"]):
        outflow = db_session.get(BankStatementLine, bounce_setup["outflow_id"])
        assert outflow is not None
        outflow.classification = StatementLineClassification.UNKNOWN
        outflow.status = StatementLineStatus.CLASSIFIED
        db_session.commit()

    result = record_payment_bounce(
        db_session,
        bounce_setup["entity_id"],
        bounce_setup["statement_id"],
        outflow_line_id=bounce_setup["outflow_id"],
        return_line_id=bounce_setup["return_id"],
        person_type=BouncePersonType.SUPPLIER,
        person_id=bounce_setup["supplier_id"],
        fee_line_id=None,
        actor_id=ACTOR_ID,
    )

    outflow_line = next(line for line in result.lines if line.id == bounce_setup["outflow_id"])
    assert outflow_line.classification == StatementLineClassification.PAYMENT_BOUNCED


def test_bounce_rejects_amount_mismatch(db_session, bounce_setup) -> None:
    with entity_context(db_session, bounce_setup["entity_id"]):
        return_line = db_session.get(BankStatementLine, bounce_setup["return_id"])
        assert return_line is not None
        return_line.amount_kurus = 4_000_000
        db_session.commit()

    with pytest.raises(BouncePairError, match="Return amount must equal"):
        record_payment_bounce(
            db_session,
            bounce_setup["entity_id"],
            bounce_setup["statement_id"],
            outflow_line_id=bounce_setup["outflow_id"],
            return_line_id=bounce_setup["return_id"],
            person_type=BouncePersonType.SUPPLIER,
            person_id=bounce_setup["supplier_id"],
            fee_line_id=None,
            actor_id=ACTOR_ID,
        )


def test_bounce_lines_count_as_settled(db_session, bounce_setup) -> None:
    record_payment_bounce(
        db_session,
        bounce_setup["entity_id"],
        bounce_setup["statement_id"],
        outflow_line_id=bounce_setup["outflow_id"],
        return_line_id=bounce_setup["return_id"],
        person_type=BouncePersonType.SUPPLIER,
        person_id=bounce_setup["supplier_id"],
        fee_line_id=bounce_setup["fee_id"],
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, bounce_setup["entity_id"]):
        statement = db_session.get(BankStatement, bounce_setup["statement_id"])
        assert statement is not None
        lines = list(
            db_session.scalars(
                select(BankStatementLine).where(
                    BankStatementLine.statement_id == statement.id
                )
            )
        )
        gl_account = db_session.get(Account, bounce_setup["bank"].gl_account_id)
        assert gl_account is not None
        assert all(statement_line_is_settled(line) for line in lines)
        closing = effective_stated_closing_balance_kurus(
            db_session,
            gl_account,
            [statement],
            statement,
        )
    assert closing == statement.closing_balance_kurus


def test_bounce_blocks_statement_discard(db_session, bounce_setup) -> None:
    record_payment_bounce(
        db_session,
        bounce_setup["entity_id"],
        bounce_setup["statement_id"],
        outflow_line_id=bounce_setup["outflow_id"],
        return_line_id=bounce_setup["return_id"],
        person_type=BouncePersonType.SUPPLIER,
        person_id=bounce_setup["supplier_id"],
        fee_line_id=None,
        actor_id=ACTOR_ID,
    )

    with pytest.raises(statement_service.StatementNotDiscardableError):
        statement_service.discard_bank_statement(
            db_session,
            bounce_setup["entity_id"],
            bounce_setup["statement_id"],
        )
