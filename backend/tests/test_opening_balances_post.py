"""Opening balance posting — GL + supplier subledger (Phase 3 Slice 4)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.onboarding.posting import AlreadyPostedError, post_opening_balances
from app.core.payables import ledger as payables_ledger
from app.core.payables.models import SupplierLedgerEntry
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.entities import service as entity_service
from app.features.onboarding.opening_balances import OpeningBalanceLineInput
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
GO_LIVE = date(2026, 1, 1)


@pytest.fixture
def seeded_entity(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return restaurant_a


def _bank(db_session, entity):
    return banking_service.create_money_account(
        db_session,
        entity.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )


def _supplier(db_session, entity, *, name="Metro", vkn="1234567890"):
    return supplier_service.create_supplier(
        db_session,
        entity.id,
        SupplierCreate(name=name, vkn=vkn),
    )


def _ap_gl_balance(db_session, entity_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        ap = db_session.scalar(select(Account).where(Account.code == "2000"))
        assert ap is not None
        debits = db_session.scalar(
            select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0)).where(
                JournalEntryLine.account_id == ap.id,
                JournalEntryLine.side == AccountNormalBalance.DEBIT,
            )
        )
        credits = db_session.scalar(
            select(func.coalesce(func.sum(JournalEntryLine.amount_kurus), 0)).where(
                JournalEntryLine.account_id == ap.id,
                JournalEntryLine.side == AccountNormalBalance.CREDIT,
            )
        )
    return int(credits or 0) - int(debits or 0)


def test_post_creates_balanced_opening_balance_journal(db_session, seeded_entity) -> None:
    bank = _bank(db_session, seeded_entity)
    bank_id = bank.id
    supplier = _supplier(db_session, seeded_entity)
    supplier_id = supplier.id
    lines = [
        OpeningBalanceLineInput(money_account_id=bank_id, amount_kurus=500_000),
        OpeningBalanceLineInput(supplier_id=supplier_id, amount_kurus=200_000),
        OpeningBalanceLineInput(
            account_code="1200",
            amount_kurus=50_000,
            side=AccountNormalBalance.DEBIT,
        ),
    ]

    result = post_opening_balances(
        db_session,
        seeded_entity.id,
        go_live_date=GO_LIVE,
        lines=lines,
        actor_id=ACTOR_ID,
    )

    entry = result.journal_entry
    assert entry.source == JournalEntrySource.OPENING_BALANCE
    assert entry.entry_date == GO_LIVE
    debits = sum(
        line.amount_kurus
        for line in entry.lines
        if line.side == AccountNormalBalance.DEBIT
    )
    credits = sum(
        line.amount_kurus
        for line in entry.lines
        if line.side == AccountNormalBalance.CREDIT
    )
    assert debits == credits == 550_000


def test_supplier_subledger_rows_linked_with_journal_entry_id(
    db_session, seeded_entity
) -> None:
    supplier = _supplier(db_session, seeded_entity)
    supplier_id = supplier.id
    result = post_opening_balances(
        db_session,
        seeded_entity.id,
        go_live_date=GO_LIVE,
        lines=[OpeningBalanceLineInput(supplier_id=supplier_id, amount_kurus=125_000)],
        actor_id=ACTOR_ID,
    )

    assert len(result.supplier_ledger_entries) == 1
    entry = result.supplier_ledger_entries[0]
    assert entry.journal_entry_id == result.journal_entry.id
    assert entry.amount_kurus == 125_000


def test_gl_ap_equals_subledger_sum(db_session, seeded_entity) -> None:
    s1 = _supplier(db_session, seeded_entity, name="Alpha", vkn="1111111111")
    s1_id = s1.id
    s2 = _supplier(db_session, seeded_entity, name="Beta", vkn="2222222222")
    s2_id = s2.id
    post_opening_balances(
        db_session,
        seeded_entity.id,
        go_live_date=GO_LIVE,
        lines=[
            OpeningBalanceLineInput(supplier_id=s1_id, amount_kurus=100_000),
            OpeningBalanceLineInput(supplier_id=s2_id, amount_kurus=40_000),
        ],
        actor_id=ACTOR_ID,
    )

    gl_ap = _ap_gl_balance(db_session, seeded_entity.id)
    subledger_total = payables_ledger.current_balance_kurus(
        db_session, seeded_entity.id, s1_id
    ) + payables_ledger.current_balance_kurus(db_session, seeded_entity.id, s2_id)
    assert gl_ap == subledger_total == 140_000


def test_bank_sub_account_gl_debited(db_session, seeded_entity) -> None:
    bank = _bank(db_session, seeded_entity)
    post_opening_balances(
        db_session,
        seeded_entity.id,
        go_live_date=GO_LIVE,
        lines=[OpeningBalanceLineInput(money_account_id=bank.id, amount_kurus=500_000)],
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, seeded_entity.id):
        gl_account = db_session.get(Account, bank.gl_account_id)
        assert gl_account is not None
        balance = banking_service.gl_balance_kurus(
            db_session, gl_account.id, gl_account.normal_balance
        )
    assert balance == 500_000


def test_double_post_rejected(db_session, seeded_entity) -> None:
    lines = [
        OpeningBalanceLineInput(
            account_code="1000",
            amount_kurus=10_000,
            side=AccountNormalBalance.DEBIT,
        )
    ]
    post_opening_balances(
        db_session,
        seeded_entity.id,
        go_live_date=GO_LIVE,
        lines=lines,
        actor_id=ACTOR_ID,
    )

    with pytest.raises(AlreadyPostedError, match="already been posted"):
        post_opening_balances(
            db_session,
            seeded_entity.id,
            go_live_date=GO_LIVE,
            lines=lines,
            actor_id=ACTOR_ID,
        )


def test_entity_isolation(db_session, restaurant_a, restaurant_b) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    seed_default_chart(db_session, restaurant_b.id)

    post_opening_balances(
        db_session,
        restaurant_a.id,
        go_live_date=GO_LIVE,
        lines=[
            OpeningBalanceLineInput(
                account_code="1000",
                amount_kurus=10_000,
                side=AccountNormalBalance.DEBIT,
            )
        ],
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_b.id):
        visible = list(db_session.scalars(select(JournalEntry)))
    assert len(visible) == 0

    post_opening_balances(
        db_session,
        restaurant_b.id,
        go_live_date=GO_LIVE,
        lines=[
            OpeningBalanceLineInput(
                account_code="1000",
                amount_kurus=5_000,
                side=AccountNormalBalance.DEBIT,
            )
        ],
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_b.id):
        assert len(list(db_session.scalars(select(JournalEntry)))) == 1


def test_stores_go_live_date_setting(db_session, seeded_entity) -> None:
    post_opening_balances(
        db_session,
        seeded_entity.id,
        go_live_date=GO_LIVE,
        lines=[
            OpeningBalanceLineInput(
                account_code="1000",
                amount_kurus=10_000,
                side=AccountNormalBalance.DEBIT,
            )
        ],
        actor_id=ACTOR_ID,
    )

    setting = entity_service.get_entity_setting_by_key(
        db_session, seeded_entity.id, "go_live_date"
    )
    assert setting is not None
    assert setting.value == GO_LIVE.isoformat()


def test_api_post_opening_balances_e2e(
    client: TestClient, db_session, restaurant_a, seeded_entity
) -> None:
    bank = _bank(db_session, restaurant_a)
    bank_id = bank.id
    supplier = _supplier(db_session, restaurant_a)
    supplier_id = supplier.id

    response = client.post(
        f"/onboarding/entities/{restaurant_a.id}/opening-balances/post",
        json={
            "go_live_date": GO_LIVE.isoformat(),
            "actor_id": str(ACTOR_ID),
            "lines": [
                {"money_account_id": str(bank_id), "amount_kurus": 500000},
                {"supplier_id": str(supplier_id), "amount_kurus": 200000},
            ],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["journal_entry_id"]
    assert body["go_live_date"] == GO_LIVE.isoformat()
    assert len(body["supplier_ledger_entries"]) == 1

    second = client.post(
        f"/onboarding/entities/{restaurant_a.id}/opening-balances/post",
        json={
            "go_live_date": GO_LIVE.isoformat(),
            "actor_id": str(ACTOR_ID),
            "lines": [
                {"account_code": "1000", "amount_kurus": 100, "side": "debit"},
            ],
        },
    )
    assert second.status_code == 409

    with entity_context(db_session, restaurant_a.id):
        entry = db_session.get(SupplierLedgerEntry, body["supplier_ledger_entries"][0]["id"])
        assert entry is not None
        assert entry.journal_entry_id == uuid.UUID(body["journal_entry_id"])
