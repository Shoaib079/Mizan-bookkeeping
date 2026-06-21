"""Bank fee and credit card payment GL posting (Phase 4 deferred slices)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.banking.statement_posting import (
    build_bank_fee_posting_lines,
    build_credit_card_payment_posting_lines,
    post_bank_fee,
    post_credit_card_payment,
)
from app.core.chart_of_accounts.default_chart import BANK_CHARGES_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.onboarding.posting import post_opening_balances
from app.features.onboarding.opening_balances import OpeningBalanceLineInput
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.credit_card_payment_models import CreditCardPayment
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    StatementLineClassification,
    StatementLineStatus,
)

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
GO_LIVE = date(2026, 1, 1)


@pytest.fixture
def upload_dir(tmp_path, monkeypatch):
    path = tmp_path / "uploads"
    monkeypatch.setattr("app.config.settings.upload_dir", str(path))
    return path


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


def _credit_card(db_session, entity_id):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.CREDIT_CARD,
            name="Garanti Business Card",
            bank_name="Garanti BBVA",
            last_four="4321",
        ),
    )


@pytest.fixture
def fee_setup(db_session, restaurant_a, upload_dir):
    seed_default_chart(db_session, restaurant_a.id)
    bank = _bank_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "accounts": accounts,
    }


@pytest.fixture
def card_payment_setup(db_session, restaurant_a, upload_dir):
    seed_default_chart(db_session, restaurant_a.id)
    bank = _bank_account(db_session, restaurant_a.id)
    card = _credit_card(db_session, restaurant_a.id)
    post_opening_balances(
        db_session,
        restaurant_a.id,
        go_live_date=GO_LIVE,
        lines=[OpeningBalanceLineInput(money_account_id=card.id, amount_kurus=400_000)],
        actor_id=ACTOR_ID,
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "card": card,
        "accounts": accounts,
    }


def test_build_bank_fee_posting_lines() -> None:
    bank_id = uuid.uuid4()
    charges_id = uuid.uuid4()
    lines = build_bank_fee_posting_lines(
        bank_gl_account_id=bank_id,
        bank_charges_account_id=charges_id,
        amount_kurus=25_000,
    )
    assert len(lines) == 2
    assert lines[0].account_id == charges_id
    assert lines[0].side == AccountNormalBalance.DEBIT
    assert lines[1].account_id == bank_id
    assert lines[1].side == AccountNormalBalance.CREDIT


def test_build_credit_card_payment_posting_lines() -> None:
    card_id = uuid.uuid4()
    bank_id = uuid.uuid4()
    lines = build_credit_card_payment_posting_lines(
        credit_card_gl_account_id=card_id,
        bank_gl_account_id=bank_id,
        amount_kurus=150_000,
    )
    assert len(lines) == 2
    assert lines[0].account_id == card_id
    assert lines[0].side == AccountNormalBalance.DEBIT
    assert lines[1].account_id == bank_id
    assert lines[1].side == AccountNormalBalance.CREDIT


def test_bank_fee_classification_posts_gl(db_session, fee_setup) -> None:
    entity_id = fee_setup["entity_id"]
    bank = fee_setup["bank"]
    charges_id = fee_setup["accounts"][BANK_CHARGES_CODE]

    csv = (
        "transaction_date,amount_kurus,description,reference\n"
        "2026-02-03,-25000,Bank service fee,FEE-FEB\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="fee.csv",
    )
    fee_line = statement.lines[0]

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        fee_line.id,
        classification=StatementLineClassification.BANK_FEE,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.classification == StatementLineClassification.BANK_FEE
    assert result.journal_entry_id is not None

    with entity_context(db_session, entity_id):
        entry = db_session.get(JournalEntry, result.journal_entry_id)
        assert entry is not None
        assert entry.source == JournalEntrySource.BANK_FEE
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry_id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[charges_id].side == AccountNormalBalance.DEBIT
    assert by_account[charges_id].amount_kurus == 25_000
    assert by_account[bank.gl_account_id].side == AccountNormalBalance.CREDIT
    assert by_account[bank.gl_account_id].amount_kurus == 25_000


def test_bank_fee_rejects_inflow(db_session, fee_setup) -> None:
    entity_id = fee_setup["entity_id"]
    bank = fee_setup["bank"]
    csv = (
        "transaction_date,amount_kurus,description,reference\n"
        "2026-02-03,25000,Fee reversal,FEE-REV\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="fee.csv",
    )

    with pytest.raises(statement_service.InvalidClassificationError, match="outflow"):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            statement.lines[0].id,
            classification=StatementLineClassification.BANK_FEE,
            actor_id=ACTOR_ID,
        )


def test_credit_card_payment_reduces_liability_not_expense(
    db_session, card_payment_setup
) -> None:
    entity_id = card_payment_setup["entity_id"]
    bank = card_payment_setup["bank"]
    card = card_payment_setup["card"]

    with entity_context(db_session, entity_id):
        card_balance_before = banking_service.gl_balance_kurus(
            db_session, card.gl_account_id, AccountNormalBalance.CREDIT
        )
        bank_balance_before = banking_service.gl_balance_kurus(
            db_session, bank.gl_account_id, AccountNormalBalance.DEBIT
        )
        expense_accounts = {
            a.id
            for a in db_session.scalars(select(Account)).all()
            if a.account_type == AccountType.EXPENSE
        }

    assert card_balance_before == 400_000

    csv = (
        "transaction_date,amount_kurus,description,reference\n"
        "2026-02-10,-150000,Card payment Garanti,CC-PAY-01\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="cc-pay.csv",
    )

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        statement.lines[0].id,
        classification=StatementLineClassification.CREDIT_CARD_PAYMENT,
        credit_card_money_account_id=card.id,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.credit_card_payment_id is not None
    assert result.journal_entry_id is not None

    with entity_context(db_session, entity_id):
        payment = db_session.get(CreditCardPayment, result.line.credit_card_payment_id)
        assert payment is not None
        assert payment.bank_statement_line_id == statement.lines[0].id

        entry = db_session.get(JournalEntry, result.journal_entry_id)
        assert entry is not None
        assert entry.source == JournalEntrySource.CREDIT_CARD_PAYMENT

        journal_lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry_id
            )
        ).all()
        by_account = {line.account_id: line for line in journal_lines}

        card_balance_after = banking_service.gl_balance_kurus(
            db_session, card.gl_account_id, AccountNormalBalance.CREDIT
        )
        bank_balance_after = banking_service.gl_balance_kurus(
            db_session, bank.gl_account_id, AccountNormalBalance.DEBIT
        )

    assert by_account[card.gl_account_id].side == AccountNormalBalance.DEBIT
    assert by_account[card.gl_account_id].amount_kurus == 150_000
    assert by_account[bank.gl_account_id].side == AccountNormalBalance.CREDIT
    assert by_account[bank.gl_account_id].amount_kurus == 150_000
    assert set(by_account.keys()) == {card.gl_account_id, bank.gl_account_id}
    assert not set(by_account.keys()) & expense_accounts

    assert card_balance_after == 250_000
    assert bank_balance_after == bank_balance_before - 150_000


def test_credit_card_payment_rejects_inflow(db_session, card_payment_setup) -> None:
    entity_id = card_payment_setup["entity_id"]
    bank = card_payment_setup["bank"]
    card = card_payment_setup["card"]
    csv = (
        "transaction_date,amount_kurus,description,reference\n"
        "2026-02-10,150000,Card refund,CC-REF\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="cc-ref.csv",
    )

    with pytest.raises(statement_service.InvalidClassificationError, match="outflow"):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            statement.lines[0].id,
            classification=StatementLineClassification.CREDIT_CARD_PAYMENT,
            credit_card_money_account_id=card.id,
            actor_id=ACTOR_ID,
        )


def test_credit_card_payment_rejects_bank_account(db_session, card_payment_setup) -> None:
    entity_id = card_payment_setup["entity_id"]
    bank = card_payment_setup["bank"]
    csv = (
        "transaction_date,amount_kurus,description,reference\n"
        "2026-02-10,-150000,Card payment,CC-PAY\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="cc-pay.csv",
    )

    with pytest.raises(statement_service.InvalidClassificationError, match="credit_card"):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            statement.lines[0].id,
            classification=StatementLineClassification.CREDIT_CARD_PAYMENT,
            credit_card_money_account_id=bank.id,
            actor_id=ACTOR_ID,
        )


def test_post_credit_card_payment_manual(db_session, card_payment_setup) -> None:
    entity_id = card_payment_setup["entity_id"]
    bank = card_payment_setup["bank"]
    card = card_payment_setup["card"]

    result = post_credit_card_payment(
        db_session,
        entity_id,
        credit_card_money_account_id=card.id,
        bank_money_account_id=bank.id,
        payment_date=date(2026, 2, 15),
        amount_kurus=50_000,
        description="Manual card payment",
        actor_id=ACTOR_ID,
    )

    assert result.credit_card_payment.amount_kurus == 50_000
    assert result.journal_entry.source == JournalEntrySource.CREDIT_CARD_PAYMENT

    with entity_context(db_session, entity_id):
        card_balance = banking_service.gl_balance_kurus(
            db_session, card.gl_account_id, AccountNormalBalance.CREDIT
        )
    assert card_balance == 350_000


def test_post_bank_fee_manual(db_session, fee_setup) -> None:
    entity_id = fee_setup["entity_id"]
    bank = fee_setup["bank"]

    result = post_bank_fee(
        db_session,
        entity_id,
        bank_money_account_id=bank.id,
        fee_date=date(2026, 2, 3),
        amount_kurus=10_000,
        description="Wire fee",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.BANK_FEE


def test_credit_card_payment_api_e2e(
    client: TestClient, db_session, card_payment_setup
) -> None:
    entity_id = card_payment_setup["entity_id"]
    bank = card_payment_setup["bank"]
    card = card_payment_setup["card"]

    csv = (
        "transaction_date,amount_kurus,description,reference\n"
        "2026-02-10,-100000,Card payment,CC-PAY\n"
    ).encode()
    import_resp = client.post(
        f"/entities/{entity_id}/banking/accounts/{bank.id}/statements",
        files={"file": ("cc-pay.csv", csv, "text/csv")},
    )
    assert import_resp.status_code == 201
    body = import_resp.json()
    line_id = body["lines"][0]["id"]

    classify_resp = client.patch(
        f"/entities/{entity_id}/banking/statements/{body['id']}/lines/{line_id}/classify",
        json={
            "classification": "credit_card_payment",
            "credit_card_money_account_id": str(card.id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert classify_resp.status_code == 200
    data = classify_resp.json()
    assert data["line"]["status"] == "posted"
    assert data["line"]["credit_card_payment_id"] is not None
    assert data["journal_entry_id"] is not None
