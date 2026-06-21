"""Own-account transfer linking and GL posting (Phase 3 Slice 3)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.banking import posting as banking_posting
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.ledger.posting import PostingLine, post_journal_entry
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking import transfers as transfer_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import AccountTransferCreate, MoneyAccountCreate
from app.features.banking.statement_models import (
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.banking.transfer_models import AccountTransfer

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _bank_payload(name: str) -> MoneyAccountCreate:
    return MoneyAccountCreate(
        account_kind=MoneyAccountKind.BANK,
        name=name,
        bank_name="Test Bank",
    )


def _fund_account(
    db_session,
    entity_id: uuid.UUID,
    gl_account_id: uuid.UUID,
    ap_account_id: uuid.UUID,
    amount: int,
) -> None:
    post_journal_entry(
        db_session,
        entity_id,
        date(2026, 1, 1),
        f"Fund {amount}",
        [
            PostingLine(gl_account_id, amount, AccountNormalBalance.DEBIT),
            PostingLine(ap_account_id, amount, AccountNormalBalance.CREDIT),
        ],
        actor_id=ACTOR_ID,
        source=JournalEntrySource.MANUAL,
    )


def _transfer_csv(content: str) -> bytes:
    return content.encode("utf-8")


@pytest.fixture
def transfer_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}

    bank_a = banking_service.create_money_account(
        db_session, restaurant_a.id, _bank_payload("Bank A")
    )
    bank_b = banking_service.create_money_account(
        db_session, restaurant_a.id, _bank_payload("Bank B")
    )
    _fund_account(
        db_session,
        restaurant_a.id,
        bank_a.gl_account_id,
        accounts["2000"],
        10_000_000,
    )
    _fund_account(
        db_session,
        restaurant_a.id,
        bank_b.gl_account_id,
        accounts["2000"],
        2_000_000,
    )

    return {
        "entity_id": restaurant_a.id,
        "bank_a": bank_a,
        "bank_b": bank_b,
        "accounts": accounts,
    }


def test_manual_transfer_gl_debits_destination_credits_source(
    db_session, transfer_setup
) -> None:
    entity_id = transfer_setup["entity_id"]
    bank_a = transfer_setup["bank_a"]
    bank_b = transfer_setup["bank_b"]

    result = banking_posting.post_account_transfer(
        db_session,
        entity_id,
        from_money_account_id=bank_a.id,
        to_money_account_id=bank_b.id,
        transfer_date=date(2026, 2, 10),
        amount_kurus=3_000_000,
        description="Internal transfer A→B",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.TRANSFER
    with entity_context(db_session, entity_id):
        lines = list(
            db_session.scalars(
                select(JournalEntryLine).where(
                    JournalEntryLine.journal_entry_id == result.journal_entry.id
                )
            )
        )
        assert len(lines) == 2
        account_ids = {line.account_id for line in lines}
        assert account_ids == {bank_a.gl_account_id, bank_b.gl_account_id}

        sides = {line.account_id: line.side for line in lines}
        assert sides[bank_b.gl_account_id] == AccountNormalBalance.DEBIT
        assert sides[bank_a.gl_account_id] == AccountNormalBalance.CREDIT

        balance_a = banking_service.gl_balance_kurus(
            db_session, bank_a.gl_account_id, AccountNormalBalance.DEBIT
        )
        balance_b = banking_service.gl_balance_kurus(
            db_session, bank_b.gl_account_id, AccountNormalBalance.DEBIT
        )
        assert balance_a == 7_000_000
        assert balance_b == 5_000_000

        touched_types = db_session.scalars(
            select(Account.account_type)
            .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
            .where(JournalEntryLine.journal_entry_id == result.journal_entry.id)
        ).all()
        assert AccountType.REVENUE not in touched_types
        assert AccountType.EXPENSE not in touched_types


def test_statement_outflow_classify_transfer_posts(
    db_session, transfer_setup, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("app.config.settings.upload_dir", str(tmp_path / "uploads"))
    entity_id = transfer_setup["entity_id"]
    bank_a = transfer_setup["bank_a"]
    bank_b = transfer_setup["bank_b"]

    csv = _transfer_csv(
        "transaction_date,amount_kurus,description,reference\n"
        "2026-02-15,-1500000,Transfer to Bank B,XFER-01\n"
    )
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_a.id,
        csv,
        original_filename="outflow.csv",
    )
    line = statement.lines[0]

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line.id,
        classification=StatementLineClassification.TRANSFER,
        counterpart_money_account_id=bank_b.id,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.classification == StatementLineClassification.TRANSFER
    assert result.line.account_transfer_id is not None
    assert result.linked_existing_transfer is False

    with entity_context(db_session, entity_id):
        transfer = db_session.get(AccountTransfer, result.line.account_transfer_id)
        assert transfer is not None
        assert transfer.from_statement_line_id == line.id
        assert transfer.to_statement_line_id is None
        assert transfer.from_money_account_id == bank_a.id
        assert transfer.to_money_account_id == bank_b.id


def test_statement_inflow_links_prior_outflow_single_journal(
    db_session, transfer_setup, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("app.config.settings.upload_dir", str(tmp_path / "uploads"))
    entity_id = transfer_setup["entity_id"]
    bank_a = transfer_setup["bank_a"]
    bank_b = transfer_setup["bank_b"]

    out_csv = _transfer_csv(
        "transaction_date,amount_kurus,description,reference\n"
        "2026-02-20,-800000,Transfer to Bank B,XFER-02\n"
    )
    out_statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_a.id,
        out_csv,
        original_filename="out.csv",
    )
    out_line = out_statement.lines[0]
    out_result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        out_statement.id,
        out_line.id,
        classification=StatementLineClassification.TRANSFER,
        counterpart_money_account_id=bank_b.id,
        actor_id=ACTOR_ID,
    )
    out_journal_id = out_result.journal_entry_id

    with entity_context(db_session, entity_id):
        journal_before = db_session.scalar(select(func.count()).select_from(JournalEntry))

    in_csv = _transfer_csv(
        "transaction_date,amount_kurus,description,reference\n"
        "2026-02-20,800000,Transfer from Bank A,XFER-02\n"
    )
    in_statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_b.id,
        in_csv,
        original_filename="in.csv",
    )
    in_line = in_statement.lines[0]
    in_result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        in_statement.id,
        in_line.id,
        classification=StatementLineClassification.TRANSFER,
        counterpart_money_account_id=bank_a.id,
        actor_id=ACTOR_ID,
    )

    assert in_result.linked_existing_transfer is True
    assert in_result.line.status == StatementLineStatus.LINKED
    assert in_result.journal_entry_id == out_journal_id

    with entity_context(db_session, entity_id):
        journal_after = db_session.scalar(select(func.count()).select_from(JournalEntry))
        transfer = db_session.get(AccountTransfer, in_result.line.account_transfer_id)
    assert journal_after == journal_before
    assert transfer is not None
    assert transfer.to_statement_line_id == in_line.id


def test_statement_inflow_without_prior_outflow_posts(
    db_session, transfer_setup, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("app.config.settings.upload_dir", str(tmp_path / "uploads"))
    entity_id = transfer_setup["entity_id"]
    bank_a = transfer_setup["bank_a"]
    bank_b = transfer_setup["bank_b"]

    in_csv = _transfer_csv(
        "transaction_date,amount_kurus,description,reference\n"
        "2026-02-25,500000,Transfer from Bank A,XFER-03\n"
    )
    in_statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_b.id,
        in_csv,
        original_filename="in-only.csv",
    )
    in_line = in_statement.lines[0]

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        in_statement.id,
        in_line.id,
        classification=StatementLineClassification.TRANSFER,
        counterpart_money_account_id=bank_a.id,
        actor_id=ACTOR_ID,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.linked_existing_transfer is False
    with entity_context(db_session, entity_id):
        transfer = db_session.get(AccountTransfer, result.line.account_transfer_id)
    assert transfer is not None
    assert transfer.to_statement_line_id == in_line.id
    assert transfer.from_money_account_id == bank_a.id


def test_same_from_to_rejected(db_session, transfer_setup) -> None:
    bank_a = transfer_setup["bank_a"]
    with pytest.raises(banking_posting.InvalidTransferError):
        banking_posting.post_account_transfer(
            db_session,
            transfer_setup["entity_id"],
            from_money_account_id=bank_a.id,
            to_money_account_id=bank_a.id,
            transfer_date=date(2026, 2, 1),
            amount_kurus=100_000,
            description="Self transfer",
            actor_id=ACTOR_ID,
        )


def test_cross_entity_rejected(db_session, restaurant_b, transfer_setup) -> None:
    seed_default_chart(db_session, restaurant_b.id)
    bank_b_other = banking_service.create_money_account(
        db_session, restaurant_b.id, _bank_payload("Other Bank")
    )
    with pytest.raises(banking_posting.InvalidTransferError):
        banking_posting.post_account_transfer(
            db_session,
            transfer_setup["entity_id"],
            from_money_account_id=transfer_setup["bank_a"].id,
            to_money_account_id=bank_b_other.id,
            transfer_date=date(2026, 2, 1),
            amount_kurus=100_000,
            description="Cross entity",
            actor_id=ACTOR_ID,
        )


def test_reclassify_posted_transfer_line_rejected(
    db_session, transfer_setup, tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("app.config.settings.upload_dir", str(tmp_path / "uploads"))
    entity_id = transfer_setup["entity_id"]
    csv = _transfer_csv(
        "transaction_date,amount_kurus,description,reference\n"
        "2026-03-01,-100000,Transfer,XFER-04\n"
    )
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        transfer_setup["bank_a"].id,
        csv,
        original_filename="xfer.csv",
    )
    line = statement.lines[0]
    statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line.id,
        classification=StatementLineClassification.TRANSFER,
        counterpart_money_account_id=transfer_setup["bank_b"].id,
        actor_id=ACTOR_ID,
    )
    with pytest.raises(statement_service.LineAlreadyResolvedError):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            line.id,
            classification=StatementLineClassification.BANK_FEE,
        )


def test_entity_isolation_list_transfers(
    db_session, restaurant_b, transfer_setup
) -> None:
    seed_default_chart(db_session, restaurant_b.id)
    transfer_service.create_account_transfer(
        db_session,
        transfer_setup["entity_id"],
        AccountTransferCreate(
            from_money_account_id=transfer_setup["bank_a"].id,
            to_money_account_id=transfer_setup["bank_b"].id,
            transfer_date=date(2026, 2, 1),
            amount_kurus=100_000,
            description="Internal",
            actor_id=ACTOR_ID,
        ),
    )
    visible_a = transfer_service.list_account_transfers(
        db_session, transfer_setup["entity_id"]
    )
    visible_b = transfer_service.list_account_transfers(db_session, restaurant_b.id)
    assert len(visible_a) == 1
    assert visible_b == []


def test_api_create_and_list_transfers(
    client: TestClient, db_session, transfer_setup
) -> None:
    entity_id = transfer_setup["entity_id"]
    bank_a = transfer_setup["bank_a"]
    bank_b = transfer_setup["bank_b"]

    create_resp = client.post(
        f"/entities/{entity_id}/banking/transfers",
        json={
            "from_money_account_id": str(bank_a.id),
            "to_money_account_id": str(bank_b.id),
            "transfer_date": "2026-02-28",
            "amount_kurus": 250000,
            "description": "API transfer",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["journal_entry_id"]
    assert body["amount_kurus"] == 250000

    list_resp = client.get(
        f"/entities/{entity_id}/banking/transfers",
        params={"money_account_id": str(bank_a.id)},
    )
    assert list_resp.status_code == 200
    transfers = list_resp.json()
    assert len(transfers) == 1
    assert transfers[0]["id"] == body["id"]
