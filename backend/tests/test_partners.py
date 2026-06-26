"""Partner reimbursements — GL control account, no double-count (Phase 5 Slice 4)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.core.chart_of_accounts.default_chart import PARTNER_REIMBURSEMENT_PAYABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.core.partners import ledger as partner_ledger
from app.core.partners import posting as partner_posting
from app.core.partners.models import PartnerLedgerEntry
from app.core.partners.types import PartnerMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.partners.models import Partner


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def partner_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        partner = Partner(name="Ahmet Partner")
        db_session.add(partner)
        db_session.commit()
        db_session.refresh(partner)
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "accounts": accounts,
        "partner_id": partner.id,
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


def _expense_total(db_session, entity_id: uuid.UUID, account_id: uuid.UUID) -> int:
    return _gl_balance(db_session, entity_id, account_id, AccountNormalBalance.DEBIT)


def _subledger_balance(db_session, entity_id: uuid.UUID, partner_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        total = db_session.scalar(
            select(func.coalesce(func.sum(PartnerLedgerEntry.amount_kurus), 0)).where(
                PartnerLedgerEntry.partner_id == partner_id
            )
        )
        return int(total or 0)


def test_expense_fronted_dr_expense_cr_2150(db_session, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    accounts = partner_setup["accounts"]

    result = partner_posting.post_expense_fronted(
        db_session,
        entity_id,
        partner_id,
        expense_date=date(2026, 6, 1),
        amount_kurus=150_000,
        description="June rent fronted",
        actor_id=ACTOR_ID,
        expense_account_id=accounts["5000"],
    )

    assert result.journal_entry.source == JournalEntrySource.PARTNER_EXPENSE_FRONTED
    assert result.balance_kurus == 150_000
    assert _expense_total(db_session, entity_id, accounts["5000"]) == 150_000
    assert _gl_balance(
        db_session,
        entity_id,
        accounts[PARTNER_REIMBURSEMENT_PAYABLE_CODE],
        AccountNormalBalance.CREDIT,
    ) == 150_000
    assert _subledger_balance(db_session, entity_id, partner_id) == 150_000


def test_reimbursement_paid_dr_2150_no_expense(db_session, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    accounts = partner_setup["accounts"]
    drawer = partner_setup["drawer"]

    partner_posting.post_expense_fronted(
        db_session,
        entity_id,
        partner_id,
        expense_date=date(2026, 6, 1),
        amount_kurus=150_000,
        description="June rent fronted",
        actor_id=ACTOR_ID,
        expense_account_id=accounts["5000"],
    )

    result = partner_posting.post_reimbursement_paid(
        db_session,
        entity_id,
        partner_id,
        payment_date=date(2026, 6, 15),
        amount_kurus=150_000,
        description="Rent reimbursement",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    assert result.journal_entry.source == JournalEntrySource.PARTNER_REIMBURSEMENT_PAID
    assert _expense_total(db_session, entity_id, accounts["5000"]) == 150_000
    assert _gl_balance(
        db_session,
        entity_id,
        accounts[PARTNER_REIMBURSEMENT_PAYABLE_CODE],
        AccountNormalBalance.CREDIT,
    ) == 0
    assert _subledger_balance(db_session, entity_id, partner_id) == 0

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        expense_lines = [
            line
            for line in lines
            if line.account_id in (accounts["5000"], accounts["5200"], accounts["5100"])
        ]
        assert expense_lines == []


def test_control_account_reconciles_subledger_sum(db_session, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]
    accounts = partner_setup["accounts"]
    drawer = partner_setup["drawer"]

    with entity_context(db_session, entity_id):
        partner_b = Partner(name="Mehmet Partner")
        db_session.add(partner_b)
        db_session.commit()
        partner_b_id = partner_b.id

    partner_posting.post_expense_fronted(
        db_session,
        entity_id,
        partner_setup["partner_id"],
        expense_date=date(2026, 6, 1),
        amount_kurus=100_000,
        description="Utilities",
        actor_id=ACTOR_ID,
        expense_account_id=accounts["5200"],
    )
    partner_posting.post_expense_fronted(
        db_session,
        entity_id,
        partner_b_id,
        expense_date=date(2026, 6, 2),
        amount_kurus=50_000,
        description="Supplies",
        actor_id=ACTOR_ID,
        expense_account_id=accounts["5200"],
    )
    partner_posting.post_reimbursement_paid(
        db_session,
        entity_id,
        partner_setup["partner_id"],
        payment_date=date(2026, 6, 10),
        amount_kurus=40_000,
        description="Partial pay",
        actor_id=ACTOR_ID,
        payment_account_id=drawer.gl_account_id,
    )

    gl_2150 = _gl_balance(
        db_session,
        entity_id,
        accounts[PARTNER_REIMBURSEMENT_PAYABLE_CODE],
        AccountNormalBalance.CREDIT,
    )
    subledger_total = partner_ledger.entity_total_balance_kurus(db_session, entity_id)
    assert gl_2150 == subledger_total == 110_000


def test_reimbursement_overpayment_rejected(db_session, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    accounts = partner_setup["accounts"]
    drawer = partner_setup["drawer"]

    partner_posting.post_expense_fronted(
        db_session,
        entity_id,
        partner_id,
        expense_date=date(2026, 6, 1),
        amount_kurus=50_000,
        description="Small expense",
        actor_id=ACTOR_ID,
        expense_account_id=accounts["5000"],
    )

    with pytest.raises(partner_ledger.OverpaymentError):
        partner_posting.post_reimbursement_paid(
            db_session,
            entity_id,
            partner_id,
            payment_date=date(2026, 6, 15),
            amount_kurus=60_000,
            description="Too much",
            actor_id=ACTOR_ID,
            payment_account_id=drawer.gl_account_id,
        )


def test_non_expense_account_rejected(db_session, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    accounts = partner_setup["accounts"]

    with pytest.raises(Exception, match="not an expense"):
        partner_posting.post_expense_fronted(
            db_session,
            entity_id,
            partner_id,
            expense_date=date(2026, 6, 1),
            amount_kurus=10_000,
            description="Bad account",
            actor_id=ACTOR_ID,
            expense_account_id=accounts[PARTNER_REIMBURSEMENT_PAYABLE_CODE],
        )


def test_partner_ledger_immutable(db_session, partner_setup) -> None:
    from sqlalchemy.exc import DBAPIError

    entity_id = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    accounts = partner_setup["accounts"]

    partner_posting.post_expense_fronted(
        db_session,
        entity_id,
        partner_id,
        expense_date=date(2026, 6, 1),
        amount_kurus=10_000,
        description="Test",
        actor_id=ACTOR_ID,
        expense_account_id=accounts["5000"],
    )

    with entity_context(db_session, entity_id):
        entry_id = db_session.scalar(
            select(PartnerLedgerEntry.id).where(
                PartnerLedgerEntry.partner_id == partner_id
            )
        )

    with pytest.raises(DBAPIError, match="immutable"):
        with entity_context(db_session, entity_id):
            db_session.execute(
                text(
                    "UPDATE partner_ledger_entries SET amount_kurus = 1 WHERE id = :id"
                ),
                {"id": entry_id},
            )
            db_session.commit()


def test_cross_entity_isolation(db_session, restaurant_a, restaurant_b, partner_setup) -> None:
    entity_a = partner_setup["entity_id"]
    partner_id = partner_setup["partner_id"]
    accounts = partner_setup["accounts"]

    seed_default_chart(db_session, restaurant_b.id)
    with entity_context(db_session, restaurant_b.id):
        other_partner = Partner(name="Other")
        db_session.add(other_partner)
        db_session.commit()

    with pytest.raises(LookupError):
        partner_posting.post_expense_fronted(
            db_session,
            restaurant_b.id,
            partner_id,
            expense_date=date(2026, 6, 1),
            amount_kurus=10_000,
            description="Cross entity",
            actor_id=ACTOR_ID,
            expense_account_id=accounts["5000"],
        )

    with pytest.raises(LookupError):
        partner_ledger.current_balance_kurus(db_session, restaurant_b.id, partner_id)

    partner_posting.post_expense_fronted(
        db_session,
        entity_a,
        partner_id,
        expense_date=date(2026, 6, 1),
        amount_kurus=10_000,
        description="Own entity",
        actor_id=ACTOR_ID,
        expense_account_id=accounts["5000"],
    )
    assert partner_ledger.current_balance_kurus(db_session, entity_a, partner_id) == 10_000


def test_partners_api_e2e(client: TestClient, db_session, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]
    drawer = partner_setup["drawer"]
    accounts = partner_setup["accounts"]

    create = client.post(
        f"/entities/{entity_id}/partners",
        json={"name": "API Partner"},
    )
    assert create.status_code == 201
    partner_id = create.json()["id"]

    fronted = client.post(
        f"/entities/{entity_id}/partners/{partner_id}/expenses-fronted",
        json={
            "expense_date": "2026-06-01",
            "amount_kurus": 75_000,
            "description": "API rent",
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(accounts["5000"]),
        },
    )
    assert fronted.status_code == 201
    assert fronted.json()["balance_kurus"] == 75_000

    ledger = client.get(f"/entities/{entity_id}/partners/{partner_id}/ledger")
    assert ledger.status_code == 200
    assert ledger.json()["balance_kurus"] == 75_000
    assert ledger.json()["entries"][0]["movement_type"] == PartnerMovementType.EXPENSE_FRONTED.value

    paid = client.post(
        f"/entities/{entity_id}/partners/{partner_id}/reimbursements",
        json={
            "payment_date": "2026-06-15",
            "amount_kurus": 75_000,
            "description": "API payback",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(drawer.gl_account_id),
        },
    )
    assert paid.status_code == 201
    assert paid.json()["balance_kurus"] == 0

    overpay = client.post(
        f"/entities/{entity_id}/partners/{partner_id}/reimbursements",
        json={
            "payment_date": "2026-06-16",
            "amount_kurus": 1,
            "description": "Too much",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(drawer.gl_account_id),
        },
    )
    assert overpay.status_code == 422

    list_resp = client.get(f"/entities/{entity_id}/partners")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] >= 2


def test_partner_ownership_share_pct(client: TestClient, partner_setup) -> None:
    entity_id = partner_setup["entity_id"]

    ok = client.post(
        f"/entities/{entity_id}/partners",
        json={"name": "Owner A", "ownership_share_pct": "60"},
    )
    assert ok.status_code == 201
    assert ok.json()["ownership_share_pct"] == "60.00"

    ok2 = client.post(
        f"/entities/{entity_id}/partners",
        json={"name": "Owner B", "ownership_share_pct": "40"},
    )
    assert ok2.status_code == 201

    listed = client.get(f"/entities/{entity_id}/partners")
    assert listed.status_code == 200
    body = listed.json()
    assert body["ownership_share"]["total_pct"] == "100.00"
    assert body["ownership_share"]["warning"] is None


def test_partner_ownership_share_warns_when_not_100(
    client: TestClient, partner_setup
) -> None:
    entity_id = partner_setup["entity_id"]

    client.post(
        f"/entities/{entity_id}/partners",
        json={"name": "Owner A", "ownership_share_pct": "60"},
    )
    client.post(
        f"/entities/{entity_id}/partners",
        json={"name": "Owner B", "ownership_share_pct": "30"},
    )

    listed = client.get(f"/entities/{entity_id}/partners")
    warning = listed.json()["ownership_share"]["warning"]
    assert warning is not None
    assert "90" in warning


def test_partner_ownership_share_rejects_over_100(
    client: TestClient, partner_setup
) -> None:
    entity_id = partner_setup["entity_id"]
    response = client.post(
        f"/entities/{entity_id}/partners",
        json={"name": "Too Much", "ownership_share_pct": "100.01"},
    )
    assert response.status_code == 422
