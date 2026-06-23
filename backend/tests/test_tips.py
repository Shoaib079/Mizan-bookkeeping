"""Tips pass-through — accrual and payout, not revenue/expense (Phase 6)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    CARD_SALES_CLEARING_CODE,
    SALARY_EXPENSE_CODE,
    SALES_REVENUE_CODE,
    TIPS_PAYABLE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.core.tips import posting as tips_posting
from app.db.session import entity_context
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking import service as banking_service
from app.features.tips.models import TipAccrualSource


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def tips_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
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


def _account_codes_on_journal(db_session, entity_id: uuid.UUID, journal_entry_id: uuid.UUID) -> set[str]:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(Account.code)
            .join(JournalEntryLine, JournalEntryLine.account_id == Account.id)
            .where(JournalEntryLine.journal_entry_id == journal_entry_id)
        ).all()
        return {row[0] for row in rows}


def test_card_accrual_dr_1400_cr_2260_no_revenue_expense(db_session, tips_setup) -> None:
    entity_id = tips_setup["entity_id"]
    accounts = tips_setup["accounts"]

    result = tips_posting.post_tip_accrual(
        db_session,
        entity_id,
        accrual_date=date(2026, 6, 1),
        amount_kurus=15_000,
        source=TipAccrualSource.CARD,
        description="Card tips from POS",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.TIP_ACCRUAL
    codes = _account_codes_on_journal(db_session, entity_id, result.journal_entry.id)
    assert codes == {CARD_SALES_CLEARING_CODE, TIPS_PAYABLE_CODE}
    assert SALES_REVENUE_CODE not in codes
    assert SALARY_EXPENSE_CODE not in codes
    assert _gl_balance(
        db_session, entity_id, accounts[CARD_SALES_CLEARING_CODE], AccountNormalBalance.DEBIT
    ) == 15_000
    assert _gl_balance(
        db_session, entity_id, accounts[TIPS_PAYABLE_CODE], AccountNormalBalance.CREDIT
    ) == 15_000


def test_cash_accrual_dr_cash_cr_2260(db_session, tips_setup) -> None:
    entity_id = tips_setup["entity_id"]
    accounts = tips_setup["accounts"]
    drawer = tips_setup["drawer"]

    result = tips_posting.post_tip_accrual(
        db_session,
        entity_id,
        accrual_date=date(2026, 6, 2),
        amount_kurus=8_000,
        source=TipAccrualSource.CASH,
        money_account_id=drawer.id,
        description="Cash tips held in drawer",
        actor_id=ACTOR_ID,
    )

    assert result.tip_accrual.money_account_id == drawer.id
    codes = _account_codes_on_journal(db_session, entity_id, result.journal_entry.id)
    assert TIPS_PAYABLE_CODE in codes
    assert SALES_REVENUE_CODE not in codes
    assert _gl_balance(
        db_session, entity_id, drawer.gl_account_id, AccountNormalBalance.DEBIT
    ) == 8_000
    assert _gl_balance(
        db_session, entity_id, accounts[TIPS_PAYABLE_CODE], AccountNormalBalance.CREDIT
    ) == 8_000


def test_payout_dr_2260_cr_cash_not_expense(db_session, tips_setup) -> None:
    entity_id = tips_setup["entity_id"]
    accounts = tips_setup["accounts"]
    drawer = tips_setup["drawer"]

    tips_posting.post_tip_accrual(
        db_session,
        entity_id,
        accrual_date=date(2026, 6, 1),
        amount_kurus=20_000,
        source=TipAccrualSource.CARD,
        description="Card tips",
        actor_id=ACTOR_ID,
    )

    result = tips_posting.post_tip_payout(
        db_session,
        entity_id,
        payout_date=date(2026, 6, 3),
        amount_kurus=12_000,
        money_account_id=drawer.id,
        description="Tips paid to staff",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.TIP_PAYOUT
    codes = _account_codes_on_journal(db_session, entity_id, result.journal_entry.id)
    assert codes == {TIPS_PAYABLE_CODE, drawer.gl_account_code}
    assert SALARY_EXPENSE_CODE not in codes
    assert _gl_balance(
        db_session, entity_id, accounts[TIPS_PAYABLE_CODE], AccountNormalBalance.CREDIT
    ) == 8_000
    assert _gl_balance(
        db_session, entity_id, drawer.gl_account_id, AccountNormalBalance.DEBIT
    ) == -12_000


def test_payout_rejected_when_exceeds_pot_balance(db_session, tips_setup) -> None:
    entity_id = tips_setup["entity_id"]
    drawer = tips_setup["drawer"]

    tips_posting.post_tip_accrual(
        db_session,
        entity_id,
        accrual_date=date(2026, 6, 1),
        amount_kurus=5_000,
        source=TipAccrualSource.CARD,
        description="Card tips",
        actor_id=ACTOR_ID,
    )

    with pytest.raises(tips_posting.InvalidTipsPostingError, match="exceeds tips payable balance"):
        tips_posting.post_tip_payout(
            db_session,
            entity_id,
            payout_date=date(2026, 6, 2),
            amount_kurus=6_000,
            money_account_id=drawer.id,
            description="Too much",
            actor_id=ACTOR_ID,
        )


def test_balance_endpoint_reflects_accruals_minus_payouts(
    client: TestClient, db_session, tips_setup
) -> None:
    entity_id = tips_setup["entity_id"]
    drawer = tips_setup["drawer"]
    base = f"/entities/{entity_id}/tips"

    balance = client.get(f"{base}/balance")
    assert balance.status_code == 200
    assert balance.json()["balance_kurus"] == 0

    card_accrual = client.post(
        f"{base}/accruals",
        json={
            "accrual_date": "2026-06-01",
            "amount_kurus": 30_000,
            "source": "card",
            "description": "Card tips",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert card_accrual.status_code == 201

    cash_accrual = client.post(
        f"{base}/accruals",
        json={
            "accrual_date": "2026-06-02",
            "amount_kurus": 10_000,
            "source": "cash",
            "money_account_id": str(drawer.id),
            "description": "Cash tips held",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert cash_accrual.status_code == 201

    balance = client.get(f"{base}/balance")
    assert balance.json()["balance_kurus"] == 40_000

    payout = client.post(
        f"{base}/payouts",
        json={
            "payout_date": "2026-06-03",
            "amount_kurus": 25_000,
            "money_account_id": str(drawer.id),
            "description": "Staff payout",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert payout.status_code == 201

    balance = client.get(f"{base}/balance")
    assert balance.json()["balance_kurus"] == 15_000

    accruals = client.get(f"{base}/accruals")
    assert accruals.status_code == 200
    assert accruals.json()["total"] == 2

    payouts = client.get(f"{base}/payouts")
    assert payouts.status_code == 200
    assert payouts.json()["total"] == 1

    overpay = client.post(
        f"{base}/payouts",
        json={
            "payout_date": "2026-06-04",
            "amount_kurus": 20_000,
            "money_account_id": str(drawer.id),
            "description": "Too much",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert overpay.status_code == 422


def test_card_accrual_rejects_money_account_id(client: TestClient, tips_setup) -> None:
    entity_id = tips_setup["entity_id"]
    drawer = tips_setup["drawer"]

    response = client.post(
        f"/entities/{entity_id}/tips/accruals",
        json={
            "accrual_date": "2026-06-01",
            "amount_kurus": 1_000,
            "source": "card",
            "money_account_id": str(drawer.id),
            "description": "Invalid",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 422
