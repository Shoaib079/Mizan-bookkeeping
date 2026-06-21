"""Opening balance validation and day-one journal drafts (Decisions §19)."""

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.onboarding.posting import AlreadyPostedError, post_opening_balances
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.onboarding.opening_balances import (
    OpeningBalanceError,
    OpeningBalanceLine,
    OpeningBalanceLineInput,
    OpeningBalanceNotSupportedError,
    build_day_one_journal,
    build_day_one_journal_aggregate,
    validate_opening_balance_lines,
)
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def seeded_entity(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return restaurant_a


def test_unbalanced_user_lines_get_equity_offset() -> None:
    lines = [
        OpeningBalanceLine("1100", 1_000_000, AccountNormalBalance.DEBIT),
        OpeningBalanceLine("2000", 300_000, AccountNormalBalance.CREDIT),
    ]
    journal = build_day_one_journal_aggregate(lines)
    debits = sum(l.amount_kurus for l in journal if l.side == AccountNormalBalance.DEBIT)
    credits = sum(l.amount_kurus for l in journal if l.side == AccountNormalBalance.CREDIT)
    assert debits == credits == 1_000_000
    equity_lines = [l for l in journal if l.account_code == "3900"]
    assert len(equity_lines) == 1
    assert equity_lines[0].amount_kurus == 700_000
    assert equity_lines[0].side == AccountNormalBalance.CREDIT


def test_rejects_wrong_side_for_account(seeded_entity, db_session) -> None:
    lines = [
        OpeningBalanceLineInput(
            account_code="1100",
            amount_kurus=100,
            side=AccountNormalBalance.CREDIT,
        )
    ]
    with pytest.raises(OpeningBalanceError, match="opening side must be debit"):
        validate_opening_balance_lines(db_session, seeded_entity.id, lines)


def test_rejects_opening_balance_on_equity_account(seeded_entity, db_session) -> None:
    lines = [
        OpeningBalanceLineInput(
            account_code="3900",
            amount_kurus=100,
            side=AccountNormalBalance.CREDIT,
        )
    ]
    with pytest.raises(OpeningBalanceNotSupportedError, match="not supported yet"):
        validate_opening_balance_lines(db_session, seeded_entity.id, lines)


def test_rejects_revenue_account_opening_balance(seeded_entity, db_session) -> None:
    lines = [
        OpeningBalanceLineInput(
            account_code="4000",
            amount_kurus=100,
            side=AccountNormalBalance.CREDIT,
        )
    ]
    with pytest.raises(OpeningBalanceNotSupportedError, match="not supported yet"):
        validate_opening_balance_lines(db_session, seeded_entity.id, lines)


def test_rejects_fx_wallet_opening_balance(seeded_entity, db_session) -> None:
    lines = [
        OpeningBalanceLineInput(
            account_code="1010",
            amount_kurus=100_00,
            side=AccountNormalBalance.DEBIT,
        )
    ]
    with pytest.raises(OpeningBalanceNotSupportedError, match="FX wallet opening balances are not supported yet"):
        validate_opening_balance_lines(db_session, seeded_entity.id, lines)


def test_rejects_partner_payable_opening_balance(seeded_entity, db_session) -> None:
    lines = [
        OpeningBalanceLineInput(
            account_code="2150",
            amount_kurus=50_000,
            side=AccountNormalBalance.CREDIT,
        )
    ]
    with pytest.raises(OpeningBalanceNotSupportedError, match="Partner reimbursement opening balances are not supported yet"):
        validate_opening_balance_lines(db_session, seeded_entity.id, lines)


def test_rejects_sub_account_code_not_supported_yet(seeded_entity, db_session) -> None:
    lines = [
        OpeningBalanceLineInput(
            account_code="1101",
            amount_kurus=100,
            side=AccountNormalBalance.DEBIT,
        )
    ]
    with pytest.raises(OpeningBalanceError, match="unknown account code"):
        validate_opening_balance_lines(db_session, seeded_entity.id, lines)


def test_validate_accepts_money_account_line(db_session, seeded_entity) -> None:
    bank = banking_service.create_money_account(
        db_session,
        seeded_entity.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )
    lines = [OpeningBalanceLineInput(money_account_id=bank.id, amount_kurus=50_000)]
    validate_opening_balance_lines(db_session, seeded_entity.id, lines)
    journal = build_day_one_journal(db_session, seeded_entity.id, lines)
    assert any(line.account_code == bank.gl_account_code for line in journal)


def test_validate_accepts_supplier_line(db_session, seeded_entity) -> None:
    supplier = supplier_service.create_supplier(
        db_session,
        seeded_entity.id,
        SupplierCreate(name="Metro", vkn="1234567890"),
    )
    lines = [OpeningBalanceLineInput(supplier_id=supplier.id, amount_kurus=20_000)]
    validate_opening_balance_lines(db_session, seeded_entity.id, lines)
    journal = build_day_one_journal(db_session, seeded_entity.id, lines)
    ap_lines = [line for line in journal if line.account_code == "2000"]
    assert len(ap_lines) == 1
    assert ap_lines[0].amount_kurus == 20_000
    assert ap_lines[0].side == AccountNormalBalance.CREDIT


def test_validate_rejects_aggregate_1100_when_bank_sub_accounts_exist(
    db_session, seeded_entity
) -> None:
    banking_service.create_money_account(
        db_session,
        seeded_entity.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.BANK, name="Bank A"),
    )
    lines = [
        OpeningBalanceLineInput(
            account_code="1100",
            amount_kurus=100,
            side=AccountNormalBalance.DEBIT,
        )
    ]
    with pytest.raises(OpeningBalanceError, match="bank sub-accounts exist"):
        validate_opening_balance_lines(db_session, seeded_entity.id, lines)


def test_validate_rejects_aggregate_1000_when_cash_sub_accounts_exist(
    db_session, seeded_entity
) -> None:
    banking_service.create_money_account(
        db_session,
        seeded_entity.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Drawer"),
    )
    lines = [
        OpeningBalanceLineInput(
            account_code="1000",
            amount_kurus=100,
            side=AccountNormalBalance.DEBIT,
        )
    ]
    with pytest.raises(OpeningBalanceError, match="cash sub-accounts exist"):
        validate_opening_balance_lines(db_session, seeded_entity.id, lines)


def test_api_rejects_fx_opening_balance(client: TestClient, restaurant_a, seeded_entity) -> None:
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


def test_api_validate_opening_balances(client: TestClient, restaurant_a, seeded_entity) -> None:
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
