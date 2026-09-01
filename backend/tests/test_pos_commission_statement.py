"""Bank statement pos_commission classification — Dr 5310 Card Commission / Cr bank."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import (
    CARD_COMMISSION_CODE,
    CARD_SALES_CLEARING_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.pos import posting as pos_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    StatementLineClassification,
    StatementLineClassificationSource,
    StatementLineStatus,
)

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti",
            bank_name="Garanti",
        ),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "accounts": accounts,
    }


def _import_outflow(db_session, entity_id, bank, description: str, amount: str):
    csv = (
        "transaction_date,amount,description,reference\n"
        f"2026-06-05,\"{amount}\",{description},REF-1\n"
    ).encode()
    return statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="commission.csv",
    )


def test_pos_commission_posts_dr_5310_cr_bank(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    bank = setup["bank"]
    clearing_id = setup["accounts"][CARD_SALES_CLEARING_CODE]
    charges_id = setup["accounts"][CARD_COMMISSION_CODE]

    # Full-deposit bank: gross sales in, full deposit clears 1400, then the bank
    # deducts commission as a separate statement outflow.
    pos_posting.post_card_sales_batch(
        db_session,
        entity_id,
        sales_date=date(2026, 6, 1),
        gross_amount_kurus=100_000,
        description="card sales",
        actor_id=ACTOR_ID,
    )
    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 6, 2),
        amount_kurus=100_000,
        description="full deposit",
        actor_id=ACTOR_ID,
    )
    with entity_context(db_session, entity_id):
        assert (
            banking_service.gl_balance_kurus(
                db_session, clearing_id, AccountNormalBalance.DEBIT
            )
            == 0
        )

    statement = _import_outflow(
        db_session,
        entity_id,
        bank,
        "POS KOMİSYONU INDIA GATE",
        "-30,00",
    )
    line = statement.lines[0]

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line.id,
        classification=StatementLineClassification.POS_COMMISSION,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.classification == StatementLineClassification.POS_COMMISSION
    assert result.journal_entry_id is not None

    with entity_context(db_session, entity_id):
        entry = db_session.get(JournalEntry, result.journal_entry_id)
        assert entry is not None
        assert entry.source == JournalEntrySource.POS_COMMISSION_STATEMENT
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry_id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    # Dr 5310 Card Commission / Cr bank — clearing is not touched by the commission.
    assert by_account[charges_id].side == AccountNormalBalance.DEBIT
    assert by_account[charges_id].amount_kurus == 3_000
    assert by_account[bank.gl_account_id].side == AccountNormalBalance.CREDIT
    assert by_account[bank.gl_account_id].amount_kurus == 3_000
    assert clearing_id not in by_account

    with entity_context(db_session, entity_id):
        assert (
            banking_service.gl_balance_kurus(
                db_session, charges_id, AccountNormalBalance.DEBIT
            )
            == 3_000
        )


def test_pos_commission_import_routes_not_bank_fee_auto_post(db_session, setup) -> None:
    entity_id = setup["entity_id"]
    bank = setup["bank"]

    pos_posting.post_card_sales_batch(
        db_session,
        entity_id,
        sales_date=date(2026, 6, 1),
        gross_amount_kurus=100_000,
        description="card sales",
        actor_id=ACTOR_ID,
    )
    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 6, 2),
        amount_kurus=97_000,
        description="net deposit",
        actor_id=ACTOR_ID,
    )

    statement = _import_outflow(
        db_session,
        entity_id,
        bank,
        "POS KOMİSYONU INDIA GATE",
        "-3,00",
    )
    line = statement.lines[0]

    assert line.status == StatementLineStatus.NEEDS_REVIEW
    assert line.classification == StatementLineClassification.POS_COMMISSION
    assert line.journal_entry_id is None


def test_learned_pos_commission_blocks_bank_fee_auto_post(db_session, setup) -> None:
    """Fee-like wording that the owner corrected to card commission must not
    re-auto-post as bank fee on the next import (BSF-1 must yield to learning).

    Uses a real bank-fee shaped description (no POS/kart keywords) so only the
    learned rule — not deterministic POS detect — steers the line.
    """
    from app.core.learning import HIGH_CONFIDENCE_THRESHOLD
    from app.features.banking.classification_learning import (
        derive_statement_match_token,
        learn_classification_rule,
    )

    entity_id = setup["entity_id"]
    bank = setup["bank"]
    description = "HESAP İŞLETİM ÜCRETİ 12,50"
    token = derive_statement_match_token(description)
    assert token  # fee-shaped lines must still yield a learnable token

    with entity_context(db_session, entity_id):
        learn_classification_rule(
            db_session,
            description=description,
            classification=StatementLineClassification.POS_COMMISSION,
            match_token=token,
        )
        db_session.commit()

    statement = _import_outflow(
        db_session,
        entity_id,
        bank,
        description,
        "-12,50",
    )
    line = statement.lines[0]
    assert line.status == StatementLineStatus.NEEDS_REVIEW
    assert line.classification == StatementLineClassification.POS_COMMISSION
    assert line.journal_entry_id is None

    with entity_context(db_session, entity_id):
        for _ in range(HIGH_CONFIDENCE_THRESHOLD - 1):
            learn_classification_rule(
                db_session,
                description=description,
                classification=StatementLineClassification.POS_COMMISSION,
                match_token=token,
            )
        db_session.commit()

    statement2 = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        (
            "transaction_date,amount,description,reference\n"
            f'2026-06-06,"-12,50",{description},REF-2\n'
        ).encode(),
        original_filename="commission-2.csv",
    )
    line2 = statement2.lines[0]
    assert line2.status == StatementLineStatus.POSTED
    assert line2.classification == StatementLineClassification.POS_COMMISSION
    assert line2.classification_source == StatementLineClassificationSource.RULE_AUTO.value

    with entity_context(db_session, entity_id):
        entry = db_session.get(JournalEntry, line2.journal_entry_id)
        assert entry is not None
        assert entry.source == JournalEntrySource.POS_COMMISSION_STATEMENT
def test_plain_bank_fee_still_auto_posts_when_not_learned_as_commission(
    db_session, setup
) -> None:
    statement = _import_outflow(
        db_session,
        setup["entity_id"],
        setup["bank"],
        "HESAP İŞLETİM ÜCRETİ 8,00",
        "-8,00",
    )
    line = statement.lines[0]
    assert line.status == StatementLineStatus.POSTED
    assert line.classification == StatementLineClassification.BANK_FEE
