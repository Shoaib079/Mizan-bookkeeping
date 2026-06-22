"""FX spend — conversion to TRY and direct expense at average cost (Phase 5)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import FX_GAIN_CODE, FX_LOSS_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.fx import ledger as fx_ledger
from app.core.fx.average_cost import InsufficientFxBalanceError
from app.core.fx import posting as fx_posting
from app.core.fx import spend_posting as fx_spend
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _try_cash(db_session, entity_id, name: str = "Main Drawer"):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name=name),
    )


def _try_bank(db_session, entity_id, name: str = "Garanti TRY"):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name=name,
            bank_name="Garanti BBVA",
        ),
    )


def _fx_wallet(db_session, entity_id, currency: str = "USD"):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency=currency,
            name=f"{currency} Wallet",
        ),
    )


def _fund_wallet(db_session, entity_id, wallet, drawer, native: int, try_cost: int) -> None:
    fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=native,
        try_cost_kurus=try_cost,
        purchase_date=date(2026, 4, 1),
        description="Seed FX",
        actor_id=ACTOR_ID,
    )


@pytest.fixture
def fx_spend_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = _try_cash(db_session, restaurant_a.id)
    bank = _try_bank(db_session, restaurant_a.id)
    wallet = _fx_wallet(db_session, restaurant_a.id)
    _fund_wallet(db_session, restaurant_a.id, wallet, drawer, 10_000, 350_000)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "bank": bank,
        "wallet": wallet,
        "accounts": accounts,
    }


def test_conversion_realized_gain_posts_to_4200(db_session, fx_spend_setup) -> None:
    entity_id = fx_spend_setup["entity_id"]
    wallet = fx_spend_setup["wallet"]
    bank = fx_spend_setup["bank"]
    gain_id = fx_spend_setup["accounts"][FX_GAIN_CODE]
    loss_id = fx_spend_setup["accounts"][FX_LOSS_CODE]

    result = fx_spend.post_fx_conversion(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_money_account_id=bank.id,
        native_quantity=5_000,
        try_received_kurus=200_000,
        conversion_date=date(2026, 4, 10),
        description="USD to TRY",
        actor_id=ACTOR_ID,
    )

    assert result.try_cost_kurus == 175_000
    assert result.realized_gain_kurus == 25_000
    assert result.journal_entry.source == JournalEntrySource.FX_CONVERSION

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[bank.gl_account_id].side == AccountNormalBalance.DEBIT
    assert by_account[bank.gl_account_id].amount_kurus == 200_000
    assert by_account[wallet.gl_account_id].side == AccountNormalBalance.CREDIT
    assert by_account[wallet.gl_account_id].amount_kurus == 175_000
    assert by_account[gain_id].side == AccountNormalBalance.CREDIT
    assert by_account[gain_id].amount_kurus == 25_000
    assert loss_id not in by_account

    assert fx_ledger.native_quantity_balance(db_session, entity_id, wallet.id) == 5_000
    assert fx_ledger.try_cost_balance_kurus(db_session, entity_id, wallet.id) == 175_000


def test_conversion_realized_loss_posts_to_5600(db_session, fx_spend_setup) -> None:
    entity_id = fx_spend_setup["entity_id"]
    wallet = fx_spend_setup["wallet"]
    drawer = fx_spend_setup["drawer"]
    gain_id = fx_spend_setup["accounts"][FX_GAIN_CODE]
    loss_id = fx_spend_setup["accounts"][FX_LOSS_CODE]

    result = fx_spend.post_fx_conversion(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_money_account_id=drawer.id,
        native_quantity=5_000,
        try_received_kurus=170_000,
        conversion_date=date(2026, 4, 11),
        description="USD to TRY at loss",
        actor_id=ACTOR_ID,
    )

    assert result.try_cost_kurus == 175_000
    assert result.realized_gain_kurus == -5_000

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[loss_id].side == AccountNormalBalance.DEBIT
    assert by_account[loss_id].amount_kurus == 5_000
    assert gain_id not in by_account


def test_expense_spend_at_average_cost_no_gain_loss(db_session, fx_spend_setup) -> None:
    entity_id = fx_spend_setup["entity_id"]
    wallet = fx_spend_setup["wallet"]
    expense_id = fx_spend_setup["accounts"]["5200"]
    gain_id = fx_spend_setup["accounts"][FX_GAIN_CODE]
    loss_id = fx_spend_setup["accounts"][FX_LOSS_CODE]

    result = fx_spend.post_fx_expense_spend(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        expense_account_id=expense_id,
        native_quantity=2_000,
        spend_date=date(2026, 4, 12),
        description="Utility paid in USD",
        actor_id=ACTOR_ID,
    )

    assert result.try_cost_kurus == 70_000
    assert result.journal_entry.source == JournalEntrySource.FX_EXPENSE_SPEND

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}
        touched_types = {
            db_session.get(Account, aid).account_type
            for aid in by_account
            if db_session.get(Account, aid) is not None
        }

    assert by_account[expense_id].amount_kurus == 70_000
    assert by_account[wallet.gl_account_id].amount_kurus == 70_000
    assert gain_id not in by_account
    assert loss_id not in by_account
    assert AccountType.REVENUE not in touched_types

    assert fx_ledger.native_quantity_balance(db_session, entity_id, wallet.id) == 8_000
    assert fx_ledger.try_cost_balance_kurus(db_session, entity_id, wallet.id) == 280_000


def test_control_accounts_tie_after_spend(db_session, fx_spend_setup) -> None:
    entity_id = fx_spend_setup["entity_id"]
    wallet = fx_spend_setup["wallet"]
    bank = fx_spend_setup["bank"]

    fx_spend.post_fx_conversion(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_money_account_id=bank.id,
        native_quantity=3_000,
        try_received_kurus=110_000,
        conversion_date=date(2026, 4, 13),
        description="Partial convert",
        actor_id=ACTOR_ID,
    )

    subledger_cost = fx_ledger.try_cost_balance_kurus(db_session, entity_id, wallet.id)
    subledger_qty = fx_ledger.native_quantity_balance(db_session, entity_id, wallet.id)

    with entity_context(db_session, entity_id):
        gl_balance = banking_service.gl_balance_kurus(
            db_session, wallet.gl_account_id, AccountNormalBalance.DEBIT
        )

    assert subledger_cost == gl_balance
    assert subledger_qty == 7_000
    assert subledger_cost == 245_000


def test_insufficient_fx_balance_rejected(db_session, fx_spend_setup) -> None:
    with pytest.raises(InsufficientFxBalanceError):
        fx_spend.post_fx_conversion(
            db_session,
            fx_spend_setup["entity_id"],
            fx_money_account_id=fx_spend_setup["wallet"].id,
            try_money_account_id=fx_spend_setup["bank"].id,
            native_quantity=20_000,
            try_received_kurus=500_000,
            conversion_date=date(2026, 4, 14),
            description="Too much",
            actor_id=ACTOR_ID,
        )


def test_fx_conversion_api(client: TestClient, fx_spend_setup) -> None:
    entity_id = fx_spend_setup["entity_id"]
    wallet = fx_spend_setup["wallet"]
    bank = fx_spend_setup["bank"]

    resp = client.post(
        f"/entities/{entity_id}/fx/conversions",
        json={
            "fx_money_account_id": str(wallet.id),
            "try_money_account_id": str(bank.id),
            "native_quantity": 1000,
            "try_received_kurus": 36000,
            "conversion_date": "2026-04-15",
            "description": "API convert",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["try_cost_kurus"] == 35_000
    assert body["realized_gain_kurus"] == 1_000
    assert body["fx_ledger_entry"]["movement_type"] == "spend"
    assert body["fx_ledger_entry"]["native_quantity"] == -1000
