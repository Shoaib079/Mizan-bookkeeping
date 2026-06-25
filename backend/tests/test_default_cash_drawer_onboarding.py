"""Phase 11 Slice 11.1 — default cash drawer on chart seed."""

from fastapi.testclient import TestClient

from app.core.chart_of_accounts.seed import seed_default_chart
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.service import DEFAULT_CASH_DRAWER_NAME
from app.features.chart_of_accounts import service as chart_service


def test_seed_chart_creates_default_cash_drawer(db_session, restaurant_a) -> None:
    chart_service.seed_chart_for_entity(db_session, restaurant_a.id)

    cash_accounts, total = banking_service.list_money_accounts(
        db_session, restaurant_a.id, account_kind=MoneyAccountKind.CASH
    )
    assert total == 1
    assert cash_accounts[0].name == DEFAULT_CASH_DRAWER_NAME
    assert cash_accounts[0].account_kind == MoneyAccountKind.CASH
    assert cash_accounts[0].currency is None


def test_ensure_default_cash_drawer_skips_when_cash_exists(
    db_session, restaurant_a
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    custom = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Petty cash"),
    )

    created = banking_service.ensure_default_cash_drawer(db_session, restaurant_a.id)
    assert created is None

    cash_accounts, total = banking_service.list_money_accounts(
        db_session, restaurant_a.id, account_kind=MoneyAccountKind.CASH
    )
    assert total == 1
    assert cash_accounts[0].id == custom.id


def test_seed_chart_does_not_create_bank_account(db_session, restaurant_a) -> None:
    chart_service.seed_chart_for_entity(db_session, restaurant_a.id)

    bank_accounts, bank_total = banking_service.list_money_accounts(
        db_session, restaurant_a.id, account_kind=MoneyAccountKind.BANK
    )
    assert bank_total == 0
    assert bank_accounts == []


def test_api_seed_chart_cash_picker_nonempty(
    client: TestClient, restaurant_a
) -> None:
    seed = client.post(f"/entities/{restaurant_a.id}/chart-of-accounts/seed")
    assert seed.status_code == 201

    cash_list = client.get(
        f"/entities/{restaurant_a.id}/banking/accounts",
        params={"account_kind": "cash"},
    )
    assert cash_list.status_code == 200
    body = cash_list.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == DEFAULT_CASH_DRAWER_NAME
