"""Opening balance validation and day-one journal drafts (Decisions §19)."""

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.chart_of_accounts.types import AccountNormalBalance
from app.features.onboarding.opening_balances import (
    OpeningBalanceError,
    OpeningBalanceLine,
    OpeningBalanceNotSupportedError,
    build_day_one_journal,
    validate_opening_balance_lines,
)


def test_unbalanced_user_lines_get_equity_offset() -> None:
    lines = [
        OpeningBalanceLine("1100", 1_000_000, AccountNormalBalance.DEBIT),
        OpeningBalanceLine("2000", 300_000, AccountNormalBalance.CREDIT),
    ]
    journal = build_day_one_journal(lines)
    debits = sum(l.amount_kurus for l in journal if l.side == AccountNormalBalance.DEBIT)
    credits = sum(l.amount_kurus for l in journal if l.side == AccountNormalBalance.CREDIT)
    assert debits == credits == 1_000_000
    equity_lines = [l for l in journal if l.account_code == "3900"]
    assert len(equity_lines) == 1
    assert equity_lines[0].amount_kurus == 700_000
    assert equity_lines[0].side == AccountNormalBalance.CREDIT


def test_rejects_wrong_side_for_account() -> None:
    lines = [OpeningBalanceLine("1100", 100, AccountNormalBalance.CREDIT)]
    with pytest.raises(OpeningBalanceError, match="opening side must be debit"):
        validate_opening_balance_lines(lines)


def test_rejects_opening_balance_on_equity_account() -> None:
    lines = [OpeningBalanceLine("3900", 100, AccountNormalBalance.CREDIT)]
    with pytest.raises(OpeningBalanceNotSupportedError, match="not supported yet"):
        validate_opening_balance_lines(lines)


def test_rejects_revenue_account_opening_balance() -> None:
    lines = [OpeningBalanceLine("4000", 100, AccountNormalBalance.CREDIT)]
    with pytest.raises(OpeningBalanceNotSupportedError, match="not supported yet"):
        validate_opening_balance_lines(lines)


def test_rejects_fx_wallet_opening_balance() -> None:
    lines = [OpeningBalanceLine("1010", 100_00, AccountNormalBalance.DEBIT)]
    with pytest.raises(OpeningBalanceNotSupportedError, match="FX wallet opening balances are not supported yet"):
        validate_opening_balance_lines(lines)


def test_rejects_partner_payable_opening_balance() -> None:
    lines = [OpeningBalanceLine("2150", 50_000, AccountNormalBalance.CREDIT)]
    with pytest.raises(OpeningBalanceNotSupportedError, match="Partner reimbursement opening balances are not supported yet"):
        validate_opening_balance_lines(lines)


def test_rejects_sub_account_code_not_supported_yet() -> None:
    lines = [OpeningBalanceLine("1101", 100, AccountNormalBalance.DEBIT)]
    with pytest.raises(OpeningBalanceError, match="unknown account code"):
        validate_opening_balance_lines(lines)


def test_api_rejects_fx_opening_balance(client: TestClient, restaurant_a) -> None:
    response = client.post(
        f"/onboarding/entities/{restaurant_a.id}/opening-balances/validate",
        json={
            "lines": [
                {"account_code": "1020", "amount_kurus": 10000, "side": "debit"},
            ]
        },
    )
    assert response.status_code == 422
    assert "not supported yet" in response.json()["detail"].lower()


def test_api_validate_opening_balances(client: TestClient, restaurant_a) -> None:
    response = client.post(
        f"/onboarding/entities/{restaurant_a.id}/opening-balances/validate",
        json={
            "lines": [
                {"account_code": "1000", "amount_kurus": 50000, "side": "debit"},
                {"account_code": "2000", "amount_kurus": 20000, "side": "credit"},
            ]
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is True
    assert len(body["journal_lines"]) == 3
    codes = {line["account_code"] for line in body["journal_lines"]}
    assert "3900" in codes


def test_api_validate_unknown_entity(client: TestClient) -> None:
    response = client.post(
        f"/onboarding/entities/{uuid.uuid4()}/opening-balances/validate",
        json={
            "lines": [
                {"account_code": "1000", "amount_kurus": 100, "side": "debit"},
            ]
        },
    )
    assert response.status_code == 404
