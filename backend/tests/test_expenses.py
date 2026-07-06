"""Daily expenses — posting, spelling tolerance, rent_utility classify (Phase 6)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import ACCOUNTS_PAYABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.expenses.normalize import normalize_expense_item_text, similarity_score
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.expenses.models import ExpenseEntry, ExpenseEntryStatus, ExpenseItem

RENT_EXPENSE_CODE = "5000"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def expense_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "drawer": drawer,
        "accounts": accounts,
    }


def _gl_balance(
    db_session,
    entity_id: uuid.UUID,
    account_id: uuid.UUID,
    normal: AccountNormalBalance,
) -> int:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.account_id == account_id)
            .group_by(JournalEntryLine.side)
        ).all()
        debits = credits = 0
        for side, total in rows:
            if side == AccountNormalBalance.DEBIT:
                debits = int(total or 0)
            else:
                credits = int(total or 0)
        if normal == AccountNormalBalance.CREDIT:
            return credits - debits
        return debits - credits


def _account_codes_on_journal(
    db_session, entity_id: uuid.UUID, journal_entry_id: uuid.UUID
) -> set[str]:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(Account.code)
            .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
            .where(JournalEntryLine.journal_entry_id == journal_entry_id)
        ).all()
        return {row[0] for row in rows}


def test_normalize_turkish_dotless_i() -> None:
    assert normalize_expense_item_text("PEYNİR") == "peynir"
    assert normalize_expense_item_text("IŞIL") == "ışıl"


def test_similarity_score() -> None:
    assert similarity_score("peynir", "peynr") >= 0.85
    assert similarity_score("peynir", "domates") < 0.85


def test_manual_expense_posts_dr_expense_cr_bank(
    db_session, client: TestClient, expense_setup
) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]
    bank_gl = expense_setup["bank"].gl_account_id

    response = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": "2026-06-01",
            "amount_kurus": 50_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_setup["bank"].id),
            "written_item_description": "peynir",
            "has_source_document": False,
            "description": "Market alışverişi",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "posted"
    assert body["has_source_document"] is False
    journal_id = uuid.UUID(body["journal_entry_id"])

    codes = _account_codes_on_journal(db_session, entity_id, journal_id)
    assert RENT_EXPENSE_CODE in codes
    assert ACCOUNTS_PAYABLE_CODE not in codes

    with entity_context(db_session, entity_id):
        entry = db_session.get(JournalEntry, journal_id)
        assert entry is not None
        assert entry.source == JournalEntrySource.EXPENSE_ENTRY

    assert _gl_balance(db_session, entity_id, rent_id, AccountNormalBalance.DEBIT) == 50_000
    assert _gl_balance(db_session, entity_id, bank_gl, AccountNormalBalance.DEBIT) == -50_000


def test_alias_remembers_spelling(db_session, client: TestClient, expense_setup) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]
    base_payload = {
        "expense_date": "2026-06-02",
        "amount_kurus": 10_000,
        "expense_account_id": str(rent_id),
        "money_account_id": str(expense_setup["drawer"].id),
        "has_source_document": False,
        "description": "Gıda",
        "actor_id": str(ACTOR_ID),
    }

    first = client.post(
        f"/entities/{entity_id}/expenses",
        json={**base_payload, "written_item_description": "peynir"},
    )
    assert first.status_code == 201
    first_item_id = first.json()["expense_item_id"]

    second = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            **base_payload,
            "written_item_description": "peyir",
            "confirm_expense_item_id": first_item_id,
            "acknowledge_duplicate": True,
        },
    )
    assert second.status_code == 201
    assert second.json()["expense_item_id"] == first_item_id

    third = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            **base_payload,
            "written_item_description": "peyir",
            "acknowledge_duplicate": True,
        },
    )
    assert third.status_code == 201
    assert third.json()["expense_item_id"] == first_item_id


def test_fuzzy_match_needs_review_no_gl(db_session, client: TestClient, expense_setup) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": "2026-06-03",
            "amount_kurus": 8_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_setup["drawer"].id),
            "written_item_description": "peynir",
            "has_source_document": True,
            "description": "İlk kayıt",
            "actor_id": str(ACTOR_ID),
        },
    )

    before_journals = db_session.scalar(select(func.count()).select_from(JournalEntry)) or 0

    response = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": "2026-06-03",
            "amount_kurus": 5_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_setup["drawer"].id),
            "written_item_description": "peynr",
            "has_source_document": True,
            "description": "Belirsiz yazım",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "needs_review"
    assert body["journal_entry_id"] is None
    assert body["candidate_expense_item_id"] is not None

    after_journals = db_session.scalar(select(func.count()).select_from(JournalEntry)) or 0
    assert after_journals == before_journals


def test_confirm_item_posts_gl_and_remembers_alias(
    db_session, client: TestClient, expense_setup
) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    with entity_context(db_session, entity_id):
        item = ExpenseItem(canonical_name="peynir", canonical_name_normalized="peynir")
        db_session.add(item)
        db_session.commit()
        db_session.refresh(item)
        item_id = item.id

    pending = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": "2026-06-04",
            "amount_kurus": 5_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_setup["drawer"].id),
            "written_item_description": "peynr",
            "has_source_document": True,
            "description": "Review bekliyor",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert pending.status_code == 201
    expense_id = pending.json()["id"]
    assert pending.json()["status"] == "needs_review"

    confirmed = client.post(
        f"/entities/{entity_id}/expenses/{expense_id}/confirm-item",
        json={"expense_item_id": str(item_id), "actor_id": str(ACTOR_ID)},
    )
    assert confirmed.status_code == 200
    body = confirmed.json()
    assert body["status"] == "posted"
    assert body["journal_entry_id"] is not None
    assert body["expense_item_id"] == str(item_id)

    again = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            "expense_date": "2026-06-05",
            "amount_kurus": 3_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_setup["drawer"].id),
            "written_item_description": "peynr",
            "has_source_document": False,
            "description": "Alias hatırlanmalı",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert again.status_code == 201
    assert again.json()["expense_item_id"] == str(item_id)


def test_merge_items_groups_entries(db_session, client: TestClient, expense_setup) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]
    payload_base = {
        "expense_date": "2026-06-06",
        "amount_kurus": 2_000,
        "expense_account_id": str(rent_id),
        "money_account_id": str(expense_setup["drawer"].id),
        "has_source_document": False,
        "description": "Merge test",
        "actor_id": str(ACTOR_ID),
    }

    cheese = client.post(
        f"/entities/{entity_id}/expense-items",
        json={"canonical_name": "peynir"},
    )
    yogurt = client.post(
        f"/entities/{entity_id}/expense-items",
        json={"canonical_name": "yoğurt"},
    )
    assert cheese.status_code == 201
    assert yogurt.status_code == 201
    cheese_id = cheese.json()["id"]
    yogurt_id = yogurt.json()["id"]

    client.post(
        f"/entities/{entity_id}/expenses",
        json={**payload_base, "written_item_description": "peynir", "confirm_expense_item_id": cheese_id},
    )
    client.post(
        f"/entities/{entity_id}/expenses",
        json={
            **payload_base,
            "written_item_description": "yoğurt",
            "confirm_expense_item_id": yogurt_id,
            "acknowledge_duplicate": True,
        },
    )

    merged = client.post(
        f"/entities/{entity_id}/expense-items/merge",
        json={
            "source_id": yogurt_id,
            "target_id": cheese_id,
            "actor_id": str(ACTOR_ID),
        },
    )
    assert merged.status_code == 200
    assert merged.json()["id"] == cheese_id

    with entity_context(db_session, entity_id):
        entries = db_session.scalars(select(ExpenseEntry)).all()
        posted = [e for e in entries if e.status == ExpenseEntryStatus.POSTED]
        assert len(posted) == 2
        assert all(e.expense_item_id == uuid.UUID(cheese_id) for e in posted)


def test_rent_utility_classify_posts_dr_expense_cr_bank(
    db_session, expense_setup
) -> None:
    entity_id = expense_setup["entity_id"]
    bank = expense_setup["bank"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    csv = (
        "transaction_date,amount,description,reference\n"
        "2026-06-07,\"-1.200,00\",Kira ödemesi,RENT-JUN\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="rent.csv",
    )
    rent_line = statement.lines[0]

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        rent_line.id,
        classification=StatementLineClassification.RENT_UTILITY,
        actor_id=ACTOR_ID,
        expense_account_id=rent_id,
    )

    assert result.line.status == StatementLineStatus.POSTED
    assert result.line.classification == StatementLineClassification.RENT_UTILITY
    assert result.journal_entry_id is not None
    assert result.line.expense_entry_id is not None

    codes = _account_codes_on_journal(db_session, entity_id, result.journal_entry_id)
    assert RENT_EXPENSE_CODE in codes
    assert ACCOUNTS_PAYABLE_CODE not in codes

    with entity_context(db_session, entity_id):
        entry = db_session.get(JournalEntry, result.journal_entry_id)
        assert entry is not None
        assert entry.source == JournalEntrySource.EXPENSE_ENTRY


def test_rent_utility_rejects_inflow(db_session, expense_setup) -> None:
    entity_id = expense_setup["entity_id"]
    bank = expense_setup["bank"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]
    csv = (
        "transaction_date,amount,description,reference\n"
        "2026-06-07,\"1.200,00\",Rent refund,RENT-REV\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="rent.csv",
    )

    with pytest.raises(statement_service.InvalidClassificationError, match="outflow"):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            statement.lines[0].id,
            classification=StatementLineClassification.RENT_UTILITY,
            actor_id=ACTOR_ID,
            expense_account_id=rent_id,
        )


def test_cross_entity_rls_isolation(
    db_session, client: TestClient, expense_setup, restaurant_b
) -> None:
    entity_a = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]

    created = client.post(
        f"/entities/{entity_a}/expenses",
        json={
            "expense_date": "2026-06-08",
            "amount_kurus": 1_000,
            "expense_account_id": str(rent_id),
            "money_account_id": str(expense_setup["drawer"].id),
            "written_item_description": "süt",
            "has_source_document": False,
            "description": "RLS test",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert created.status_code == 201
    expense_id = uuid.UUID(created.json()["id"])

    seed_default_chart(db_session, restaurant_b.id)

    with entity_context(db_session, entity_a):
        assert db_session.get(ExpenseEntry, expense_id) is not None

    with entity_context(db_session, restaurant_b.id):
        visible = list(db_session.scalars(select(ExpenseEntry)))
        assert visible == []
        assert (
            db_session.scalar(select(ExpenseEntry).where(ExpenseEntry.id == expense_id))
            is None
        )

    list_b = client.get(f"/entities/{restaurant_b.id}/expenses")
    assert list_b.status_code == 200
    assert list_b.json()["items"] == [] and list_b.json()["total"] == 0


def test_list_expense_items_matches_alias_spelling(
    client: TestClient, expense_setup
) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]
    base_payload = {
        "expense_date": "2026-06-02",
        "amount_kurus": 10_000,
        "expense_account_id": str(rent_id),
        "money_account_id": str(expense_setup["drawer"].id),
        "has_source_document": False,
        "description": "Gıda",
        "actor_id": str(ACTOR_ID),
    }

    first = client.post(
        f"/entities/{entity_id}/expenses",
        json={**base_payload, "written_item_description": "peynir"},
    )
    assert first.status_code == 201
    first_item_id = first.json()["expense_item_id"]

    linked = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            **base_payload,
            "written_item_description": "peyir",
            "confirm_expense_item_id": first_item_id,
            "acknowledge_duplicate": True,
        },
    )
    assert linked.status_code == 201

    found = client.get(
        f"/entities/{entity_id}/expense-items",
        params={"q": "peyir", "limit": 8},
    )
    assert found.status_code == 200
    ids = {item["id"] for item in found.json()["items"]}
    assert str(first_item_id) in ids


def test_confirm_expense_item_id_reuses_item_without_duplicate(
    db_session, client: TestClient, expense_setup
) -> None:
    entity_id = expense_setup["entity_id"]
    rent_id = expense_setup["accounts"][RENT_EXPENSE_CODE]
    base_payload = {
        "expense_date": "2026-06-02",
        "amount_kurus": 10_000,
        "expense_account_id": str(rent_id),
        "money_account_id": str(expense_setup["drawer"].id),
        "has_source_document": False,
        "description": "Gıda",
        "actor_id": str(ACTOR_ID),
    }

    first = client.post(
        f"/entities/{entity_id}/expenses",
        json={**base_payload, "written_item_description": "peynir"},
    )
    first_item_id = first.json()["expense_item_id"]

    second = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            **base_payload,
            "written_item_description": "peynir",
            "confirm_expense_item_id": first_item_id,
            "acknowledge_duplicate": True,
        },
    )
    assert second.status_code == 201
    assert second.json()["expense_item_id"] == first_item_id

    third = client.post(
        f"/entities/{entity_id}/expenses",
        json={
            **base_payload,
            "written_item_description": "yeni ürün",
            "acknowledge_duplicate": True,
        },
    )
    assert third.status_code == 201
    assert third.json()["expense_item_id"] != first_item_id

    with entity_context(db_session, entity_id):
        active_items = db_session.scalars(
            select(ExpenseItem).where(ExpenseItem.is_active.is_(True))
        ).all()
        assert len(active_items) == 2
