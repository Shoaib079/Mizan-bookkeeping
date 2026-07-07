"""List credit card payments for a card account."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.core.banking.statement_posting import post_credit_card_payment
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.onboarding.posting import post_opening_balances
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.onboarding.opening_balances import OpeningBalanceLineInput

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
GO_LIVE = date(2026, 1, 1)


@pytest.fixture
def card_payment_setup(db_session, restaurant_a):
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
    card = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.CREDIT_CARD,
            name="Garanti Business Card",
            bank_name="Garanti BBVA",
            last_four="4321",
        ),
    )
    post_opening_balances(
        db_session,
        restaurant_a.id,
        go_live_date=GO_LIVE,
        lines=[OpeningBalanceLineInput(money_account_id=card.id, amount_kurus=400_000)],
        actor_id=ACTOR_ID,
    )
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "card": card,
    }


def test_list_credit_card_payments_by_date(
    client: TestClient,
    db_session,
    card_payment_setup,
) -> None:
    entity_id = card_payment_setup["entity_id"]
    bank = card_payment_setup["bank"]
    card = card_payment_setup["card"]

    post_credit_card_payment(
        db_session,
        entity_id,
        credit_card_money_account_id=card.id,
        bank_money_account_id=bank.id,
        payment_date=date(2026, 2, 10),
        amount_kurus=50_000,
        description="February payment",
        actor_id=ACTOR_ID,
    )
    post_credit_card_payment(
        db_session,
        entity_id,
        credit_card_money_account_id=card.id,
        bank_money_account_id=bank.id,
        payment_date=date(2026, 3, 5),
        amount_kurus=30_000,
        description="March payment",
        actor_id=ACTOR_ID,
    )

    all_resp = client.get(
        f"/entities/{entity_id}/banking/accounts/{card.id}/credit-card-payments",
    )
    assert all_resp.status_code == 200
    assert all_resp.json()["total"] == 2

    feb_resp = client.get(
        f"/entities/{entity_id}/banking/accounts/{card.id}/credit-card-payments"
        f"?from=2026-02-01&to=2026-02-28",
    )
    assert feb_resp.status_code == 200
    body = feb_resp.json()
    assert body["total"] == 1
    assert body["items"][0]["description"] == "February payment"
    assert body["items"][0]["amount_kurus"] == 50_000


def test_list_credit_card_payments_rejects_non_card_account(
    client: TestClient,
    card_payment_setup,
) -> None:
    entity_id = card_payment_setup["entity_id"]
    bank = card_payment_setup["bank"]

    resp = client.get(
        f"/entities/{entity_id}/banking/accounts/{bank.id}/credit-card-payments",
    )
    assert resp.status_code == 422
