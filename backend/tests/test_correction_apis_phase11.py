"""Phase 11 Slice 11.12 — dedicated correction HTTP APIs."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import ACCOUNTS_PAYABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.invoices.posting import post_confirmed_draft
from app.core.ledger.models import JournalEntry, JournalEntryStatus
from app.core.partners.types import PartnerMovementType
from app.core.receivables.types import CustomerMovementType
from app.core.staff.types import StaffMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.customers.models import Customer
from app.features.invoices import service as invoice_service
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus
from app.features.suppliers.models import Supplier
from tests.control_account_tie import books_balanced, supplier_subledger_total

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"
SAMPLE_XML = FIXTURES / "sample.xml"
ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def correction_api_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Drawer"),
    )
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )
    wallet = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            name="USD Wallet",
            currency="USD",
        ),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        customer = Customer(name="Catering Co")
        db_session.add_all([supplier, customer])
        db_session.commit()
        db_session.refresh(supplier)
        db_session.refresh(customer)
    return {
        "entity_id": restaurant_a.id,
        "accounts": accounts,
        "drawer": drawer,
        "bank": bank,
        "wallet": wallet,
        "supplier_id": supplier.id,
        "customer_id": customer.id,
    }


def _confirmed_draft(db_session, entity_id, supplier_id) -> InvoiceDraft:
    content = SAMPLE_XML.read_bytes()
    invoice_service.create_efatura_draft_from_upload(db_session, entity_id, content)
    with entity_context(db_session, entity_id):
        draft = db_session.scalar(select(InvoiceDraft))
        assert draft is not None
        draft.supplier_id = supplier_id
        draft.status = InvoiceDraftStatus.CONFIRMED
        draft.confirmed_by = ACTOR_ID
        db_session.commit()
        db_session.refresh(draft)
        return draft


def test_supplier_invoice_correct_http(client, db_session, correction_api_setup) -> None:
    entity_id = correction_api_setup["entity_id"]
    supplier_id = correction_api_setup["supplier_id"]
    accounts = correction_api_setup["accounts"]
    draft = _confirmed_draft(db_session, entity_id, supplier_id)

    posted = post_confirmed_draft(
        db_session,
        entity_id,
        draft.id,
        expense_account_id=accounts["5200"],
        actor_id=ACTOR_ID,
    )
    journal_id = posted.journal_entry.id

    response = client.post(
        f"/entities/{entity_id}/suppliers/{supplier_id}/invoices/{journal_id}/correct",
        json={
            "invoice_date": "2026-02-02",
            "description": "Corrected invoice",
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(accounts["5200"]),
            "net_kurus": 11_000_000,
            "gross_kurus": 13_200_000,
            "vat_breakdown": [
                {"rate_percent": 20.0, "base_kurus": 11_000_000, "vat_kurus": 2_200_000}
            ],
            "reason": "Wrong gross",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["original_journal_entry_id"] == str(journal_id)
    assert body["supplier_ledger_entry"]["amount_kurus"] == 13_200_000
    assert body["payable_balance_kurus"] == 13_200_000

    with entity_context(db_session, entity_id):
        old = db_session.get(JournalEntry, journal_id)
        assert old is not None
        assert old.status == JournalEntryStatus.VOIDED
    assert books_balanced(db_session, entity_id)
    assert supplier_subledger_total(db_session, entity_id) == 13_200_000


def test_credit_sale_correct_http(client, db_session, correction_api_setup) -> None:
    entity_id = correction_api_setup["entity_id"]
    customer_id = correction_api_setup["customer_id"]

    sale = client.post(
        f"/entities/{entity_id}/customers/{customer_id}/credit-sales",
        json={
            "sale_date": "2026-06-01",
            "amount_kurus": 250_000,
            "description": "June catering",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert sale.status_code == 201
    journal_id = sale.json()["journal_entry_id"]

    correct = client.post(
        f"/entities/{entity_id}/customers/{customer_id}/credit-sales/{journal_id}/correct",
        json={
            "sale_date": "2026-06-02",
            "amount_kurus": 300_000,
            "description": "Corrected catering",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert correct.status_code == 200, correct.text
    body = correct.json()
    assert body["customer_ledger_entry"]["movement_type"] == CustomerMovementType.CREDIT_SALE.value
    assert body["customer_ledger_entry"]["amount_kurus"] == 300_000
    assert body["balance_kurus"] == 300_000


def test_staff_accrual_correct_http(client, db_session, correction_api_setup) -> None:
    entity_id = correction_api_setup["entity_id"]
    base = f"/entities/{entity_id}/staff"

    employee = client.post(f"{base}/employees", json={"name": "Ali Usta"})
    assert employee.status_code == 201
    employee_id = employee.json()["id"]

    accrual = client.post(
        f"{base}/employees/{employee_id}/accruals",
        json={
            "accrual_date": "2026-06-01",
            "amount_minor": 400_000,
            "description": "June salary",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert accrual.status_code == 201
    journal_id = accrual.json()["journal_entry_id"]

    correct = client.post(
        f"{base}/employees/{employee_id}/ledger/{journal_id}/correct",
        json={
            "entry_date": "2026-06-01",
            "amount_minor": 450_000,
            "description": "Corrected June salary",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert correct.status_code == 200, correct.text
    body = correct.json()
    assert body["staff_ledger_entry"]["movement_type"] == StaffMovementType.SALARY_ACCRUED.value
    assert body["staff_ledger_entry"]["amount_minor"] == 450_000
    assert body["balance_minor"] == 450_000


def test_partner_expense_fronted_correct_http(client, db_session, correction_api_setup) -> None:
    entity_id = correction_api_setup["entity_id"]
    accounts = correction_api_setup["accounts"]

    partner = client.post(
        f"/entities/{entity_id}/partners",
        json={"name": "Partner Correct API"},
    )
    assert partner.status_code == 201
    partner_id = partner.json()["id"]

    fronted = client.post(
        f"/entities/{entity_id}/partners/{partner_id}/expenses-fronted",
        json={
            "expense_date": "2026-06-01",
            "amount_kurus": 150_000,
            "description": "Rent fronted",
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(accounts["5000"]),
        },
    )
    assert fronted.status_code == 201
    journal_id = fronted.json()["journal_entry_id"]

    correct = client.post(
        f"/entities/{entity_id}/partners/{partner_id}/ledger/{journal_id}/correct",
        json={
            "entry_date": "2026-06-02",
            "amount_kurus": 175_000,
            "description": "Corrected rent fronted",
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(accounts["5000"]),
        },
    )
    assert correct.status_code == 200, correct.text
    body = correct.json()
    assert body["partner_ledger_entry"]["movement_type"] == PartnerMovementType.EXPENSE_FRONTED.value
    assert body["partner_ledger_entry"]["amount_kurus"] == 175_000
    assert body["balance_kurus"] == 175_000


def test_fx_conversion_correct_http(client, db_session, correction_api_setup) -> None:
    entity_id = correction_api_setup["entity_id"]
    wallet = correction_api_setup["wallet"]
    bank = correction_api_setup["bank"]
    drawer = correction_api_setup["drawer"]

    purchase = client.post(
        f"/entities/{entity_id}/fx/purchases",
        json={
            "fx_money_account_id": str(wallet.id),
            "try_cash_money_account_id": str(drawer.id),
            "native_quantity": 10_000,
            "try_cost_kurus": 350_000,
            "purchase_date": "2026-04-01",
            "description": "USD buy",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert purchase.status_code == 201

    conversion = client.post(
        f"/entities/{entity_id}/fx/conversions",
        json={
            "fx_money_account_id": str(wallet.id),
            "try_money_account_id": str(bank.id),
            "native_quantity": 1000,
            "try_received_kurus": 36_000,
            "conversion_date": "2026-04-15",
            "description": "Partial convert",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert conversion.status_code == 201
    journal_id = conversion.json()["journal_entry_id"]

    correct = client.post(
        f"/entities/{entity_id}/fx/ledger/{journal_id}/correct",
        json={
            "entry_date": "2026-04-16",
            "native_quantity": 1000,
            "try_received_kurus": 37_000,
            "fx_money_account_id": str(wallet.id),
            "try_money_account_id": str(bank.id),
            "description": "Corrected convert",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert correct.status_code == 200, correct.text
    body = correct.json()
    assert body["fx_ledger_entry"]["native_quantity"] == -1000
    assert body["try_cost_kurus"] == 35_000


def test_supplier_invoice_correct_wrong_type_404(client, db_session, correction_api_setup) -> None:
    entity_id = correction_api_setup["entity_id"]
    supplier_id = correction_api_setup["supplier_id"]
    drawer = correction_api_setup["drawer"]
    accounts = correction_api_setup["accounts"]
    draft = _confirmed_draft(db_session, entity_id, supplier_id)
    post_confirmed_draft(
        db_session,
        entity_id,
        draft.id,
        expense_account_id=accounts["5200"],
        actor_id=ACTOR_ID,
    )
    payment = client.post(
        f"/entities/{entity_id}/suppliers/{supplier_id}/payments",
        json={
            "payment_date": "2026-02-01",
            "amount_kurus": 1_000_000,
            "description": "Pay",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(drawer.gl_account_id),
        },
    )
    assert payment.status_code == 200 or payment.status_code == 201
    journal_id = payment.json()["journal_entry_id"]

    response = client.post(
        f"/entities/{entity_id}/suppliers/{supplier_id}/invoices/{journal_id}/correct",
        json={
            "invoice_date": "2026-02-02",
            "description": "Should fail",
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(accounts["5200"]),
            "net_kurus": 1_000_000,
            "gross_kurus": 1_200_000,
            "vat_breakdown": [
                {"rate_percent": 20.0, "base_kurus": 1_000_000, "vat_kurus": 200_000}
            ],
        },
    )
    assert response.status_code == 404


def test_credit_sale_correct_period_lock(client, db_session, correction_api_setup) -> None:
    from app.core.period_locks.models import PeriodLockKind
    from app.core.period_locks.service import close_period
    from app.features.auth import service as auth_service
    from app.features.auth.schema import MembershipCreate, UserCreate
    from app.core.auth.types import EntityRole
    from app.features.entities.models import EntitySetting

    entity_id = correction_api_setup["entity_id"]
    customer_id = correction_api_setup["customer_id"]

    owner = auth_service.create_user(
        db_session, UserCreate(email="credit-correct-owner@example.com", display_name="Owner")
    )
    auth_service.add_entity_member(
        db_session,
        entity_id,
        MembershipCreate(user_id=owner.id, role=EntityRole.OWNER),
    )
    with entity_context(db_session, entity_id):
        db_session.add(
            EntitySetting(key="go_live_date", value=date(2026, 1, 1).isoformat())
        )
        db_session.commit()

    sale = client.post(
        f"/entities/{entity_id}/customers/{customer_id}/credit-sales",
        json={
            "sale_date": "2026-06-10",
            "amount_kurus": 100_000,
            "description": "Locked day sale",
            "actor_id": str(owner.id),
        },
    )
    assert sale.status_code == 201
    journal_id = sale.json()["journal_entry_id"]

    close_period(
        db_session,
        entity_id,
        lock_kind=PeriodLockKind.DAY,
        anchor_date=date(2026, 6, 10),
        actor_id=owner.id,
    )

    blocked = client.post(
        f"/entities/{entity_id}/customers/{customer_id}/credit-sales/{journal_id}/correct",
        json={
            "sale_date": "2026-06-10",
            "amount_kurus": 120_000,
            "description": "Blocked",
            "actor_id": str(owner.id),
        },
    )
    assert blocked.status_code == 422

    allowed = client.post(
        f"/entities/{entity_id}/customers/{customer_id}/credit-sales/{journal_id}/correct",
        json={
            "sale_date": "2026-06-10",
            "amount_kurus": 120_000,
            "description": "Unlocked",
            "actor_id": str(owner.id),
            "period_unlock_reason": "Correct credit sale in closed day",
        },
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["customer_ledger_entry"]["amount_kurus"] == 120_000
