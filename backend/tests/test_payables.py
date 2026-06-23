"""Payables ledger & balance — supplier running ledger (Phase 2)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.payables import ledger as payables_ledger
from app.core.payables import posting as payables_posting
from app.core.payables.ledger import (
    DisallowedMovementTypeError,
    OverpaymentError,
    ZeroMovementError,
)
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context
from app.features.payables import service as payables_service
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        from app.core.chart_of_accounts.models import Account

        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _supplier(db_session, entity, *, name="Metro Tedarik", vkn="1234567890"):
    return supplier_service.create_supplier(
        db_session,
        entity.id,
        SupplierCreate(name=name, vkn=vkn),
    )


def _record(
    db_session,
    entity,
    supplier_id,
    *,
    amount_kurus: int,
    movement_type=SupplierMovementType.ADJUSTMENT,
    movement_date: date | None = None,
    description="Test movement",
):
    return payables_ledger.record_supplier_movement(
        db_session,
        entity.id,
        supplier_id,
        movement_date=movement_date or date(2026, 1, 15),
        movement_type=movement_type,
        amount_kurus=amount_kurus,
        description=description,
        actor_id=ACTOR_ID,
    )


def test_adjustment_updates_balance(db_session, restaurant_a) -> None:
    supplier = _supplier(db_session, restaurant_a)
    supplier_id = supplier.id
    _record(db_session, restaurant_a, supplier_id, amount_kurus=50_000)
    _record(db_session, restaurant_a, supplier_id, amount_kurus=-20_000, description="Credit")

    balance = payables_ledger.current_balance_kurus(
        db_session, restaurant_a.id, supplier_id
    )
    assert balance == 30_000


def test_opening_balance_movement(db_session, restaurant_a) -> None:
    supplier = _supplier(db_session, restaurant_a)
    supplier_id = supplier.id
    entry = _record(
        db_session,
        restaurant_a,
        supplier_id,
        amount_kurus=125_000,
        movement_type=SupplierMovementType.OPENING_BALANCE,
        description="Opening balance",
        movement_date=date(2026, 1, 1),
    )
    assert entry.movement_type == SupplierMovementType.OPENING_BALANCE
    assert payables_ledger.current_balance_kurus(
        db_session, restaurant_a.id, supplier_id
    ) == 125_000


def test_payables_list_per_supplier_and_total(db_session, restaurant_a) -> None:
    s1 = _supplier(db_session, restaurant_a, name="Alpha", vkn="1111111111")
    s1_id = s1.id
    s2 = _supplier(db_session, restaurant_a, name="Beta", vkn="2222222222")
    s2_id = s2.id
    _record(db_session, restaurant_a, s1_id, amount_kurus=100_000)
    _record(db_session, restaurant_a, s2_id, amount_kurus=40_000)

    total, rows, _ = payables_service.list_payables(db_session, restaurant_a.id)
    balances = {supplier.id: balance for supplier, balance in rows}
    assert balances[s1_id] == 100_000
    assert balances[s2_id] == 40_000
    assert total == 140_000


def test_ledger_entries_chronological(db_session, restaurant_a) -> None:
    supplier = _supplier(db_session, restaurant_a)
    supplier_id = supplier.id
    _record(
        db_session,
        restaurant_a,
        supplier_id,
        amount_kurus=10_000,
        movement_date=date(2026, 2, 1),
        description="Later date",
    )
    _record(
        db_session,
        restaurant_a,
        supplier_id,
        amount_kurus=5_000,
        movement_date=date(2026, 1, 1),
        description="Earlier date",
    )

    entries = payables_ledger.list_ledger_entries(
        db_session, restaurant_a.id, supplier_id
    )
    assert [e.description for e in entries] == ["Earlier date", "Later date"]


def test_entity_b_cannot_see_entity_a_ledger(
    db_session, restaurant_a, restaurant_b
) -> None:
    supplier = _supplier(db_session, restaurant_a)
    supplier_id = supplier.id
    _record(db_session, restaurant_a, supplier_id, amount_kurus=99_000)

    with entity_context(db_session, restaurant_b.id):
        visible = list(db_session.scalars(select(SupplierLedgerEntry)))
        assert visible == []

    with entity_context(db_session, restaurant_b.id):
        rows = db_session.execute(
            text("SELECT amount_kurus FROM supplier_ledger_entries")
        ).all()
        assert rows == []


def test_zero_amount_rejected(db_session, restaurant_a) -> None:
    supplier = _supplier(db_session, restaurant_a)
    supplier_id = supplier.id
    with pytest.raises(ZeroMovementError):
        _record(db_session, restaurant_a, supplier_id, amount_kurus=0)


def test_unknown_supplier_404(db_session, restaurant_a) -> None:
    missing_id = uuid.uuid4()
    with pytest.raises(LookupError, match="Supplier not found"):
        payables_ledger.current_balance_kurus(
            db_session, restaurant_a.id, missing_id
        )


def test_disallowed_movement_type_rejected(db_session, restaurant_a) -> None:
    supplier = _supplier(db_session, restaurant_a)
    supplier_id = supplier.id
    with pytest.raises(DisallowedMovementTypeError):
        payables_ledger.record_supplier_movement(
            db_session,
            restaurant_a.id,
            supplier_id,
            movement_date=date(2026, 1, 1),
            movement_type=SupplierMovementType.INVOICE,
            amount_kurus=10_000,
            description="Not yet",
            actor_id=ACTOR_ID,
        )


def test_api_payables_and_ledger(
    client: TestClient, restaurant_a, restaurant_b
) -> None:
    create = client.post(
        f"/entities/{restaurant_a.id}/suppliers",
        json={"name": "API Vendor", "vkn": "3333333333"},
    )
    assert create.status_code == 201
    supplier_id = create.json()["id"]

    movement = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/ledger/movements",
        json={
            "movement_date": "2026-01-01",
            "movement_type": "opening_balance",
            "amount_kurus": 75000,
            "description": "OB",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert movement.status_code == 201

    adj = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/ledger/movements",
        json={
            "movement_date": "2026-01-10",
            "movement_type": "adjustment",
            "amount_kurus": 25000,
            "description": "Extra",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert adj.status_code == 201

    ledger = client.get(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/ledger"
    )
    assert ledger.status_code == 200
    body = ledger.json()
    assert body["balance_kurus"] == 100_000
    assert len(body["entries"]) == 2

    payables = client.get(f"/entities/{restaurant_a.id}/payables")
    assert payables.status_code == 200
    summary = payables.json()
    assert summary["total_payables_kurus"] == 100_000
    assert len(summary["suppliers"]) == 1
    assert summary["suppliers"][0]["balance_kurus"] == 100_000

    list_b = client.get(f"/entities/{restaurant_b.id}/payables")
    assert list_b.status_code == 200
    assert list_b.json()["total_payables_kurus"] == 0
    assert list_b.json()["suppliers"] == []


def test_api_zero_amount_returns_422(client: TestClient, restaurant_a) -> None:
    create = client.post(
        f"/entities/{restaurant_a.id}/suppliers",
        json={"name": "Zero Test", "vkn": "4444444444"},
    )
    supplier_id = create.json()["id"]

    response = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/ledger/movements",
        json={
            "movement_date": "2026-01-01",
            "movement_type": "adjustment",
            "amount_kurus": 0,
            "description": "Zero",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 422


def test_api_unknown_supplier_returns_404(client: TestClient, restaurant_a) -> None:
    response = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{uuid.uuid4()}/ledger/movements",
        json={
            "movement_date": "2026-01-01",
            "movement_type": "adjustment",
            "amount_kurus": 1000,
            "description": "X",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 404


def test_api_disallowed_movement_type_returns_422(
    client: TestClient, restaurant_a
) -> None:
    create = client.post(
        f"/entities/{restaurant_a.id}/suppliers",
        json={"name": "Invoice Test", "vkn": "5555555555"},
    )
    supplier_id = create.json()["id"]

    response = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/ledger/movements",
        json={
            "movement_date": "2026-01-01",
            "movement_type": "invoice",
            "amount_kurus": 1000,
            "description": "Not yet",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert response.status_code == 422


def test_payment_reduces_balance(db_session, restaurant_a, seeded_accounts) -> None:
    supplier = _supplier(db_session, restaurant_a)
    supplier_id = supplier.id
    _record(
        db_session,
        restaurant_a,
        supplier_id,
        amount_kurus=100_000,
        movement_type=SupplierMovementType.OPENING_BALANCE,
        description="Opening",
    )

    entry = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=40_000,
        description="Bank transfer",
        actor_id=ACTOR_ID,
        payment_account_id=seeded_accounts["1100"],
    ).supplier_ledger_entry
    assert entry.movement_type == SupplierMovementType.PAYMENT
    assert entry.amount_kurus == -40_000
    assert entry.journal_entry_id is not None
    assert payables_ledger.current_balance_kurus(
        db_session, restaurant_a.id, supplier_id
    ) == 60_000


def test_payment_zero_amount_rejected(db_session, restaurant_a, seeded_accounts) -> None:
    supplier = _supplier(db_session, restaurant_a)
    supplier_id = supplier.id
    _record(
        db_session,
        restaurant_a,
        supplier_id,
        amount_kurus=10_000,
        movement_type=SupplierMovementType.OPENING_BALANCE,
    )
    with pytest.raises(ValueError):
        payables_posting.post_supplier_payment(
            db_session,
            restaurant_a.id,
            supplier_id,
            payment_date=date(2026, 2, 1),
            amount_kurus=0,
            description="Zero",
            actor_id=ACTOR_ID,
            payment_account_id=seeded_accounts["1100"],
        )


def test_overpayment_rejected(db_session, restaurant_a, seeded_accounts) -> None:
    supplier = _supplier(db_session, restaurant_a)
    supplier_id = supplier.id
    _record(
        db_session,
        restaurant_a,
        supplier_id,
        amount_kurus=50_000,
        movement_type=SupplierMovementType.OPENING_BALANCE,
    )
    with pytest.raises(OverpaymentError):
        payables_posting.post_supplier_payment(
            db_session,
            restaurant_a.id,
            supplier_id,
            payment_date=date(2026, 2, 1),
            amount_kurus=60_000,
            description="Too much",
            actor_id=ACTOR_ID,
            payment_account_id=seeded_accounts["1100"],
        )


def test_api_payment_reduces_payables_list(
    client: TestClient, restaurant_a, seeded_accounts
) -> None:
    create = client.post(
        f"/entities/{restaurant_a.id}/suppliers",
        json={"name": "Pay Vendor", "vkn": "6666666666"},
    )
    supplier_id = create.json()["id"]

    client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/ledger/movements",
        json={
            "movement_date": "2026-01-01",
            "movement_type": "opening_balance",
            "amount_kurus": 80000,
            "description": "OB",
            "actor_id": str(ACTOR_ID),
        },
    )

    payment = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/payments",
        json={
            "payment_date": "2026-01-15",
            "amount_kurus": 30000,
            "description": "Partial pay",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(seeded_accounts["1100"]),
            "reference": "TRF-001",
        },
    )
    assert payment.status_code == 201
    assert payment.json()["supplier_ledger_entry"]["movement_type"] == "payment"
    assert payment.json()["supplier_ledger_entry"]["amount_kurus"] == -30000
    assert payment.json()["journal_entry_id"]

    ledger = client.get(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/ledger"
    )
    assert ledger.json()["balance_kurus"] == 50_000

    payables = client.get(f"/entities/{restaurant_a.id}/payables")
    assert payables.json()["total_payables_kurus"] == 50_000


def test_api_payment_zero_returns_422(
    client: TestClient, restaurant_a, seeded_accounts
) -> None:
    create = client.post(
        f"/entities/{restaurant_a.id}/suppliers",
        json={"name": "Zero Pay", "vkn": "7777777777"},
    )
    supplier_id = create.json()["id"]

    response = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/payments",
        json={
            "payment_date": "2026-01-01",
            "amount_kurus": 0,
            "description": "Zero",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(seeded_accounts["1100"]),
        },
    )
    assert response.status_code == 422


def test_api_overpayment_returns_422(
    client: TestClient, restaurant_a, seeded_accounts
) -> None:
    create = client.post(
        f"/entities/{restaurant_a.id}/suppliers",
        json={"name": "Over Pay", "vkn": "8888888888"},
    )
    supplier_id = create.json()["id"]

    client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/ledger/movements",
        json={
            "movement_date": "2026-01-01",
            "movement_type": "opening_balance",
            "amount_kurus": 10000,
            "description": "OB",
            "actor_id": str(ACTOR_ID),
        },
    )

    response = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/payments",
        json={
            "payment_date": "2026-01-15",
            "amount_kurus": 20000,
            "description": "Too much",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(seeded_accounts["1100"]),
        },
    )
    assert response.status_code == 422
