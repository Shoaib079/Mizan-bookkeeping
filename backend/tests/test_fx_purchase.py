"""FX purchase — GL + subledger control accounts, validation, isolation (Phase 5 Slice 2)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx import ledger as fx_ledger
from app.core.fx import posting as fx_posting
from app.core.fx.models import FxLedgerEntry
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.cash.models import CashMovement, CashMovementDirection


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def _try_cash(db_session, entity_id, name: str = "Main Drawer"):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name=name),
    )


def _fx_wallet(db_session, entity_id, currency: str = "USD", name: str = "USD Wallet"):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency=currency,
            name=name,
        ),
    )


@pytest.fixture
def fx_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = _try_cash(db_session, restaurant_a.id)
    usd_wallet = _fx_wallet(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "drawer": drawer,
        "usd_wallet": usd_wallet,
        "accounts": accounts,
    }


def test_create_fx_wallet_sub_account_under_1010(db_session, restaurant_a) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    wallet = _fx_wallet(db_session, restaurant_a.id, currency="USD", name="Petty USD")

    assert wallet.account_kind == MoneyAccountKind.FOREIGN_CURRENCY
    assert wallet.currency == "USD"
    assert wallet.gl_account_code == "1011"
    assert wallet.native_quantity == 0

    with entity_context(db_session, restaurant_a.id):
        gl = db_session.get(Account, wallet.gl_account_id)
        assert gl is not None
        assert gl.parent_account_id == db_session.scalar(
            select(Account.id).where(Account.code == "1010")
        )


def test_fx_purchase_posts_dr_fx_cr_try_cash(db_session, fx_setup) -> None:
    entity_id = fx_setup["entity_id"]
    drawer = fx_setup["drawer"]
    wallet = fx_setup["usd_wallet"]

    result = fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=10_000,
        try_cost_kurus=350_000,
        purchase_date=date(2026, 5, 1),
        description="Buy USD from drawer",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.FX_PURCHASE
    assert result.fx_ledger_entry.native_quantity == 10_000
    assert result.fx_ledger_entry.try_cost_kurus == 350_000

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        by_account = {line.account_id: line for line in lines}

    assert by_account[wallet.gl_account_id].amount_kurus == 350_000
    assert by_account[wallet.gl_account_id].side == AccountNormalBalance.DEBIT
    assert by_account[drawer.gl_account_id].amount_kurus == 350_000
    assert by_account[drawer.gl_account_id].side == AccountNormalBalance.CREDIT

    assert result.cash_movement.direction == CashMovementDirection.OUT
    assert result.cash_movement.amount_kurus == 350_000
    assert result.cash_movement.journal_entry_id == result.journal_entry.id
    assert result.cash_movement.money_account_id == drawer.id
    assert result.cash_movement.offset_account_id == wallet.gl_account_id

    with entity_context(db_session, entity_id):
        linked = db_session.scalar(
            select(CashMovement).where(
                CashMovement.journal_entry_id == result.journal_entry.id
            )
        )
    assert linked is not None
    assert linked.id == result.cash_movement.id


def test_control_account_try_cost_matches_gl(db_session, fx_setup) -> None:
    entity_id = fx_setup["entity_id"]
    drawer = fx_setup["drawer"]
    wallet = fx_setup["usd_wallet"]

    fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=5_000,
        try_cost_kurus=180_000,
        purchase_date=date(2026, 5, 2),
        description="Second buy",
        actor_id=ACTOR_ID,
    )
    fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=3_000,
        try_cost_kurus=110_000,
        purchase_date=date(2026, 5, 3),
        description="Third buy",
        actor_id=ACTOR_ID,
    )

    subledger_total = fx_ledger.try_cost_balance_kurus(db_session, entity_id, wallet.id)
    with entity_context(db_session, entity_id):
        gl_balance = banking_service.gl_balance_kurus(
            db_session,
            wallet.gl_account_id,
            AccountNormalBalance.DEBIT,
        )

    assert subledger_total == 290_000
    assert gl_balance == subledger_total


def test_control_account_native_quantity_balance(db_session, fx_setup) -> None:
    entity_id = fx_setup["entity_id"]
    drawer = fx_setup["drawer"]
    wallet = fx_setup["usd_wallet"]

    fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=10_000,
        try_cost_kurus=350_000,
        purchase_date=date(2026, 5, 1),
        description="Buy 1",
        actor_id=ACTOR_ID,
    )
    fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=2_500,
        try_cost_kurus=90_000,
        purchase_date=date(2026, 5, 4),
        description="Buy 2",
        actor_id=ACTOR_ID,
    )

    quantity = fx_ledger.native_quantity_balance(db_session, entity_id, wallet.id)
    assert quantity == 12_500

    account = banking_service.get_money_account(db_session, entity_id, wallet.id)
    assert account.native_quantity == 12_500
    assert account.balance_kurus == 440_000


def test_rejects_bank_as_try_payment_account(db_session, fx_setup) -> None:
    entity_id = fx_setup["entity_id"]
    wallet = fx_setup["usd_wallet"]

    bank = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name="Bank TRY"),
    )

    with pytest.raises(fx_posting.InvalidFxPurchaseError, match="cash drawer"):
        fx_posting.post_fx_purchase(
            db_session,
            entity_id,
            fx_money_account_id=wallet.id,
            try_cash_money_account_id=bank.id,
            native_quantity=1_000,
            try_cost_kurus=35_000,
            purchase_date=date(2026, 5, 1),
            description="Bad payment account",
            actor_id=ACTOR_ID,
        )


def test_rejects_cash_wallet_as_fx_account(db_session, fx_setup) -> None:
    entity_id = fx_setup["entity_id"]
    drawer = fx_setup["drawer"]
    wallet = fx_setup["usd_wallet"]

    with pytest.raises(fx_posting.InvalidFxPurchaseError, match="foreign currency"):
        fx_posting.post_fx_purchase(
            db_session,
            entity_id,
            fx_money_account_id=drawer.id,
            try_cash_money_account_id=wallet.id,
            native_quantity=1_000,
            try_cost_kurus=35_000,
            purchase_date=date(2026, 5, 1),
            description="Wrong accounts",
            actor_id=ACTOR_ID,
        )


def test_cross_entity_isolation(db_session, restaurant_a, restaurant_b, fx_setup) -> None:
    entity_id = fx_setup["entity_id"]
    drawer = fx_setup["drawer"]
    wallet = fx_setup["usd_wallet"]

    seed_default_chart(db_session, restaurant_b.id)
    other_drawer = _try_cash(db_session, restaurant_b.id, name="Other Drawer")

    fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=1_000,
        try_cost_kurus=35_000,
        purchase_date=date(2026, 5, 1),
        description="Entity A buy",
        actor_id=ACTOR_ID,
    )

    with pytest.raises(fx_posting.InvalidFxPurchaseError, match="not found"):
        fx_posting.post_fx_purchase(
            db_session,
            restaurant_b.id,
            fx_money_account_id=wallet.id,
            try_cash_money_account_id=other_drawer.id,
            native_quantity=1_000,
            try_cost_kurus=35_000,
            purchase_date=date(2026, 5, 1),
            description="Cross entity",
            actor_id=ACTOR_ID,
        )

    with entity_context(db_session, restaurant_b.id):
        count = db_session.scalar(select(func.count()).select_from(FxLedgerEntry))
        assert count == 0


def test_tree_includes_foreign_currency_branches(db_session, fx_setup) -> None:
    entity_id = fx_setup["entity_id"]
    drawer = fx_setup["drawer"]
    wallet = fx_setup["usd_wallet"]

    fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=10_000,
        try_cost_kurus=350_000,
        purchase_date=date(2026, 5, 1),
        description="Buy USD",
        actor_id=ACTOR_ID,
    )

    eur_wallet = _fx_wallet(db_session, entity_id, currency="EUR", name="EUR Wallet")

    tree = banking_service.get_account_tree(db_session, entity_id)
    assert tree.foreign_currency.usd.bucket_code == "1010"
    assert tree.foreign_currency.usd.balance_kurus == 350_000
    assert len(tree.foreign_currency.usd.accounts) == 1
    assert tree.foreign_currency.usd.accounts[0].native_quantity == 10_000
    assert tree.foreign_currency.eur.bucket_code == "1020"
    assert len(tree.foreign_currency.eur.accounts) == 1
    assert tree.foreign_currency.eur.accounts[0].id == eur_wallet.id
    assert tree.foreign_currency.gbp.bucket_code == "1030"

    assert eur_wallet.gl_account_code == "1021"


def test_fx_purchase_cash_movement_visible_on_drawer_session(
    client: TestClient, fx_setup, db_session
) -> None:
    entity_id = fx_setup["entity_id"]
    drawer = fx_setup["drawer"]
    wallet = fx_setup["usd_wallet"]

    purchase = client.post(
        f"/entities/{entity_id}/fx/purchases",
        json={
            "fx_money_account_id": str(wallet.id),
            "try_cash_money_account_id": str(drawer.id),
            "native_quantity": 5000,
            "try_cost_kurus": 175000,
            "purchase_date": "2026-05-15",
            "description": "Drawer FX buy",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert purchase.status_code == 201

    sessions = client.get(
        f"/entities/{entity_id}/cash/drawer-sessions?money_account_id={drawer.id}"
    )
    assert sessions.status_code == 200
    session_id = sessions.json()["items"][0]["id"]

    detail = client.get(f"/entities/{entity_id}/cash/drawer-sessions/{session_id}")
    assert detail.status_code == 200
    movements = detail.json()["movements"]
    assert len(movements) == 1
    assert movements[0]["direction"] == "out"
    assert movements[0]["amount_kurus"] == 175_000
    assert movements[0]["description"] == "Drawer FX buy"


def test_fx_purchase_correct_voids_and_reposts_cash_movement(
    db_session, fx_setup
) -> None:
    entity_id = fx_setup["entity_id"]
    drawer = fx_setup["drawer"]
    wallet = fx_setup["usd_wallet"]

    purchase = fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=10_000,
        try_cost_kurus=350_000,
        purchase_date=date(2026, 5, 1),
        description="Buy USD",
        actor_id=ACTOR_ID,
    )

    from app.core.ledger.correction import correct_fx_purchase

    result = correct_fx_purchase(
        db_session,
        entity_id,
        purchase.journal_entry.id,
        purchase_date=date(2026, 5, 2),
        native_quantity=12_000,
        try_cost_kurus=420_000,
        description="Corrected buy",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        movements = db_session.scalars(
            select(CashMovement).order_by(CashMovement.created_at.asc())
        ).all()

    assert len(movements) == 3
    original_out, reversal_in, corrected_out = movements
    assert original_out.journal_entry_id == purchase.journal_entry.id
    assert original_out.direction == CashMovementDirection.OUT
    assert reversal_in.journal_entry_id == result.reversal.id
    assert reversal_in.direction == CashMovementDirection.IN
    assert reversal_in.amount_kurus == 350_000
    assert corrected_out.journal_entry_id == result.corrected.id
    assert corrected_out.direction == CashMovementDirection.OUT
    assert corrected_out.amount_kurus == 420_000


def test_api_fx_purchase_ledger_and_balance(
    client: TestClient, fx_setup, db_session
) -> None:
    entity_id = fx_setup["entity_id"]
    drawer = fx_setup["drawer"]
    wallet = fx_setup["usd_wallet"]
    base = f"/entities/{entity_id}/fx"

    purchase = client.post(
        f"{base}/purchases",
        json={
            "fx_money_account_id": str(wallet.id),
            "try_cash_money_account_id": str(drawer.id),
            "native_quantity": 8000,
            "try_cost_kurus": 280000,
            "purchase_date": "2026-05-10",
            "description": "API buy USD",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert purchase.status_code == 201
    body = purchase.json()
    assert body["fx_ledger_entry"]["movement_type"] == "purchase"
    assert body["fx_ledger_entry"]["native_quantity"] == 8000
    assert body["fx_ledger_entry"]["try_cost_kurus"] == 280000

    ledger = client.get(f"{base}/accounts/{wallet.id}/ledger")
    assert ledger.status_code == 200
    assert ledger.json()["total"] == 1

    balance = client.get(f"{base}/accounts/{wallet.id}/balance")
    assert balance.status_code == 200
    bal = balance.json()
    assert bal["currency"] == "USD"
    assert bal["native_quantity"] == 8000
    assert bal["try_cost_kurus"] == 280000
    assert bal["gl_balance_kurus"] == 280000


def test_rls_isolation_raw_sql(db_session, restaurant_a, restaurant_b, fx_setup) -> None:
    entity_id = fx_setup["entity_id"]
    drawer = fx_setup["drawer"]
    wallet = fx_setup["usd_wallet"]

    fx_posting.post_fx_purchase(
        db_session,
        entity_id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=1_000,
        try_cost_kurus=35_000,
        purchase_date=date(2026, 5, 1),
        description="RLS test",
        actor_id=ACTOR_ID,
    )

    db_session.execute(
        text("SELECT set_config('app.current_entity_id', :eid, true)"),
        {"eid": str(restaurant_b.id)},
    )
    rows = db_session.execute(
        text("SELECT id FROM fx_ledger_entries WHERE fx_money_account_id = :mid"),
        {"mid": str(wallet.id)},
    ).all()
    assert rows == []
