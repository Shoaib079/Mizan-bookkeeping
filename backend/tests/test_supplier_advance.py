"""BSF-2 — supplier advances (pay-first, invoice-later)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.seed import ChartAlreadySeededError, seed_default_chart
from app.core.payables import ledger as payables_ledger
from app.core.payables import posting as payables_posting
from app.core.payables.advance import supplier_advance_kurus
from app.core.payables.ledger import AdvanceConfirmationRequiredError
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    BankStatementLine,
    StatementLineClassificationSource,
    StatementLineStatus,
)
from app.features.entities import service as entity_service
from app.features.entities.schema import EntitySettingCreate
from app.features.payables.advance_settings import SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KEY
from app.features.payables import service as payables_service
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate
from tests.test_statement_rule_auto_apply import (
    ACTOR_ID,
    FOURTH_METRO_DESCRIPTION,
    METRO_DESCRIPTIONS,
    _learn_supplier_rule,
)

pytestmark = pytest.mark.usefixtures("db_session")


@pytest.fixture(autouse=True)
def _seed_charts(db_session, restaurant_a):
    try:
        seed_default_chart(db_session, restaurant_a.id)
    except ChartAlreadySeededError:
        pass


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    with entity_context(db_session, restaurant_a.id):
        from app.core.chart_of_accounts.models import Account
        from sqlalchemy import select

        accounts = list(db_session.scalars(select(Account)).all())
    return {account.code: account.id for account in accounts}


def _supplier(db_session, entity):
    return supplier_service.create_supplier(
        db_session,
        entity.id,
        SupplierCreate(name="Advance Vendor", vkn="9876543210"),
    )


def test_supplier_advance_kurus_helper() -> None:
    assert supplier_advance_kurus(0, 200_000) == 200_000
    assert supplier_advance_kurus(100_000, 150_000) == 50_000
    assert supplier_advance_kurus(200_000, 150_000) == 0
    assert supplier_advance_kurus(-50_000, 100_000) == 100_000


def test_pay_first_creates_negative_balance(db_session, restaurant_a, seeded_accounts) -> None:
    supplier_id = _supplier(db_session, restaurant_a).id
    result = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 5, 1),
        amount_kurus=200_000,
        description="Pay before invoice",
        actor_id=ACTOR_ID,
        payment_account_id=seeded_accounts["1100"],
        skip_advance_confirm=True,
    )
    assert result.payable_balance_kurus == -200_000
    assert payables_ledger.current_balance_kurus(
        db_session, restaurant_a.id, supplier_id
    ) == -200_000


def test_invoice_after_advance_nets_balance(db_session, restaurant_a, seeded_accounts) -> None:
    supplier_id = _supplier(db_session, restaurant_a).id
    payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 5, 1),
        amount_kurus=200_000,
        description="Advance",
        actor_id=ACTOR_ID,
        payment_account_id=seeded_accounts["1100"],
        skip_advance_confirm=True,
    )
    payables_service.record_movement(
        db_session,
        restaurant_a.id,
        supplier_id,
        movement_date=date(2026, 5, 10),
        movement_type=SupplierMovementType.ADJUSTMENT,
        amount_kurus=500_000,
        description="Invoice arrives later",
        actor_id=ACTOR_ID,
    )
    assert payables_ledger.current_balance_kurus(
        db_session, restaurant_a.id, supplier_id
    ) == 300_000


def test_large_advance_requires_confirm(db_session, restaurant_a, seeded_accounts) -> None:
    supplier_id = _supplier(db_session, restaurant_a).id
    with pytest.raises(AdvanceConfirmationRequiredError):
        payables_posting.post_supplier_payment(
            db_session,
            restaurant_a.id,
            supplier_id,
            payment_date=date(2026, 5, 2),
            amount_kurus=200_000,
            description="Large advance",
            actor_id=ACTOR_ID,
            payment_account_id=seeded_accounts["1100"],
        )


def test_large_advance_with_confirm_succeeds(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a).id
    result = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 5, 2),
        amount_kurus=200_000,
        description="Large advance confirmed",
        actor_id=ACTOR_ID,
        payment_account_id=seeded_accounts["1100"],
        confirm_advance=True,
    )
    assert result.payable_balance_kurus == -200_000


def test_small_advance_no_confirm_needed(db_session, restaurant_a, seeded_accounts) -> None:
    supplier_id = _supplier(db_session, restaurant_a).id
    entity_service.create_entity_setting(
        db_session,
        restaurant_a.id,
        EntitySettingCreate(
            key=SUPPLIER_ADVANCE_CONFIRM_THRESHOLD_KEY,
            value="50000",
        ),
    )
    result = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 5, 3),
        amount_kurus=40_000,
        description="Small advance",
        actor_id=ACTOR_ID,
        payment_account_id=seeded_accounts["1100"],
    )
    assert result.payable_balance_kurus == -40_000


def test_api_large_advance_requires_confirm(
    client: TestClient, restaurant_a, seeded_accounts
) -> None:
    create = client.post(
        f"/entities/{restaurant_a.id}/suppliers",
        json={"name": "API Advance", "vkn": "1111111111"},
    )
    supplier_id = create.json()["id"]

    blocked = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/payments",
        json={
            "payment_date": "2026-05-04",
            "amount_kurus": 200000,
            "description": "Too big without confirm",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(seeded_accounts["1100"]),
        },
    )
    assert blocked.status_code == 422
    assert "confirm_advance" in blocked.json()["detail"].lower()

    ok = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/payments",
        json={
            "payment_date": "2026-05-04",
            "amount_kurus": 200000,
            "description": "Confirmed advance",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(seeded_accounts["1100"]),
            "confirm_advance": True,
        },
    )
    assert ok.status_code == 201
    assert ok.json()["payable_balance_kurus"] == -200_000


def test_auto_apply_posts_advance_when_no_payable(db_session, restaurant_a) -> None:
    entity_id = restaurant_a.id
    bank = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Advance Auto Bank",
            bank_name="Test",
        ),
    )
    supplier_id = supplier_service.create_supplier(
        db_session,
        entity_id,
        SupplierCreate(name="Metro Gida San Tic Ltd", vkn="1234567891"),
    ).id
    _learn_supplier_rule(db_session, entity_id, supplier_id, descriptions=METRO_DESCRIPTIONS)

    csv = (
        "transaction_date,amount,description,reference\n"
        f'2026-05-05,"-2.000,00",{FOURTH_METRO_DESCRIPTION},ADV-AUTO\n'
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv,
        original_filename="advance-auto.csv",
    )

    with entity_context(db_session, entity_id):
        line = db_session.get(BankStatementLine, statement.lines[0].id)
        assert line is not None
        assert line.status == StatementLineStatus.POSTED
        assert line.classification_source == StatementLineClassificationSource.RULE_AUTO.value
        assert line.supplier_id == supplier_id
        assert payables_ledger.current_balance_kurus(db_session, entity_id, supplier_id) == -200_000
