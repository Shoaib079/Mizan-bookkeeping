"""Credit card clearing accounts — GL sub-accounts under 2100 (Phase 4 Slice 2)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance, AccountType
from app.core.onboarding.posting import post_opening_balances
from app.db.session import entity_context
from app.features.banking import service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.onboarding.opening_balances import (
    OpeningBalanceError,
    OpeningBalanceLineInput,
    validate_opening_balance_lines,
)

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
GO_LIVE = date(2026, 1, 1)


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _credit_card_payload(**overrides) -> MoneyAccountCreate:
    base = {
        "account_kind": MoneyAccountKind.CREDIT_CARD,
        "name": "Garanti Business Card",
        "bank_name": "Garanti BBVA",
        "last_four": "4321",
    }
    base.update(overrides)
    return MoneyAccountCreate(**base)


def test_create_credit_card_sub_account(db_session, restaurant_a, seeded_accounts) -> None:
    card = service.create_money_account(
        db_session, restaurant_a.id, _credit_card_payload()
    )

    assert card.account_kind == MoneyAccountKind.CREDIT_CARD
    assert card.gl_account_code == "2101"

    with entity_context(db_session, restaurant_a.id):
        gl_card = db_session.get(Account, card.gl_account_id)
        assert gl_card is not None
        assert gl_card.parent_account_id == seeded_accounts["2100"]
        assert gl_card.account_type == AccountType.LIABILITY
        assert gl_card.normal_balance == AccountNormalBalance.CREDIT
        assert gl_card.accepts_opening_balance is True


def test_sub_account_codes_increment(db_session, restaurant_a, seeded_accounts) -> None:
    first = service.create_money_account(
        db_session, restaurant_a.id, _credit_card_payload(name="Card A")
    )
    second = service.create_money_account(
        db_session,
        restaurant_a.id,
        _credit_card_payload(name="Card B", last_four=None),
    )
    assert first.gl_account_code == "2101"
    assert second.gl_account_code == "2102"


def test_tree_includes_credit_cards_branch(db_session, restaurant_a, seeded_accounts) -> None:
    card_a = service.create_money_account(
        db_session, restaurant_a.id, _credit_card_payload(name="Card A")
    )
    card_b = service.create_money_account(
        db_session,
        restaurant_a.id,
        _credit_card_payload(name="Card B", last_four=None),
    )

    post_opening_balances(
        db_session,
        restaurant_a.id,
        go_live_date=GO_LIVE,
        lines=[
            OpeningBalanceLineInput(money_account_id=card_a.id, amount_kurus=150_000),
            OpeningBalanceLineInput(money_account_id=card_b.id, amount_kurus=75_000),
        ],
        actor_id=ACTOR_ID,
    )

    tree = service.get_account_tree(db_session, restaurant_a.id)
    assert tree.credit_cards.bucket_code == "2100"
    assert tree.credit_cards.balance_kurus == 225_000
    assert {leaf.balance_kurus for leaf in tree.credit_cards.accounts} == {150_000, 75_000}


def test_opening_balance_uses_credit_side(db_session, restaurant_a, seeded_accounts) -> None:
    card = service.create_money_account(
        db_session, restaurant_a.id, _credit_card_payload()
    )
    post_opening_balances(
        db_session,
        restaurant_a.id,
        go_live_date=GO_LIVE,
        lines=[OpeningBalanceLineInput(money_account_id=card.id, amount_kurus=200_000)],
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_a.id):
        gl_account = db_session.get(Account, card.gl_account_id)
        assert gl_account is not None
        balance = service.gl_balance_kurus(
            db_session, gl_account.id, gl_account.normal_balance
        )
    assert balance == 200_000


def test_rejects_aggregate_2100_when_credit_card_sub_accounts_exist(
    db_session, restaurant_a, seeded_accounts
) -> None:
    service.create_money_account(
        db_session, restaurant_a.id, _credit_card_payload(name="Card A")
    )
    lines = [
        OpeningBalanceLineInput(
            account_code="2100",
            amount_kurus=100,
            side=AccountNormalBalance.CREDIT,
        )
    ]
    with pytest.raises(OpeningBalanceError, match="credit card sub-accounts exist"):
        validate_opening_balance_lines(db_session, restaurant_a.id, lines)


def test_cross_entity_isolation(
    db_session, restaurant_a, restaurant_b, seeded_accounts
) -> None:
    seed_default_chart(db_session, restaurant_b.id)
    created = service.create_money_account(
        db_session, restaurant_a.id, _credit_card_payload()
    )

    with entity_context(db_session, restaurant_b.id):
        visible = list(db_session.scalars(select(Account).where(Account.code == "2101")))
        assert visible == []

    with pytest.raises(LookupError):
        service.get_money_account(db_session, restaurant_b.id, created.id)


def test_api_create_and_tree(
    client: TestClient, restaurant_a, seeded_accounts
) -> None:
    base = f"/entities/{restaurant_a.id}/banking/accounts"

    create_resp = client.post(
        base,
        json={
            "account_kind": "credit_card",
            "name": "İş Bankası Corporate",
            "bank_name": "İş Bankası",
            "last_four": "9876",
        },
    )
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["gl_account_code"] == "2101"
    assert body["account_kind"] == "credit_card"

    tree_resp = client.get(f"{base}/tree")
    assert tree_resp.status_code == 200
    tree = tree_resp.json()
    assert tree["credit_cards"]["bucket_code"] == "2100"
    assert len(tree["credit_cards"]["accounts"]) == 1
    assert tree["credit_cards"]["accounts"][0]["name"] == "İş Bankası Corporate"


def test_rls_isolation_raw_sql(db_session, restaurant_a, restaurant_b, seeded_accounts) -> None:
    seed_default_chart(db_session, restaurant_b.id)
    created = service.create_money_account(
        db_session, restaurant_a.id, _credit_card_payload()
    )

    db_session.execute(
        text("SELECT set_config('app.current_entity_id', :eid, true)"),
        {"eid": str(restaurant_b.id)},
    )
    rows = db_session.execute(
        text("SELECT id FROM money_accounts WHERE id = :mid"),
        {"mid": str(created.id)},
    ).all()
    assert rows == []
