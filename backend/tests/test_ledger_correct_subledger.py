"""Subledger-safe correct/amend — Phase 8.5 Slice 2 follow-up."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import ACCOUNTS_PAYABLE_CODE, ACCOUNTS_RECEIVABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.fx import ledger as fx_ledger
from app.core.fx import posting as fx_posting
from app.core.invoices.posting import post_confirmed_draft
from app.core.ledger.models import JournalEntry, JournalEntrySource, JournalEntryStatus
from app.core.ledger.posting import PostingLine, post_journal_entry
from app.core.payables import posting as payables_posting
from app.core.receivables import posting as receivables_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.customers.models import Customer
from app.features.invoices import service as invoice_service
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus
from app.features.suppliers.models import Supplier
from tests.control_account_tie import (
    books_balanced,
    customer_subledger_total,
    gl_asset_balance,
    gl_liability_balance,
    supplier_subledger_total,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"
SAMPLE_XML = FIXTURES / "sample.xml"
ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _supplier_id(db_session, entity) -> uuid.UUID:
    with entity_context(db_session, entity.id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        return supplier.id


def _confirmed_draft(db_session, entity, supplier_id) -> InvoiceDraft:
    content = SAMPLE_XML.read_bytes()
    invoice_service.create_efatura_draft_from_upload(db_session, entity.id, content)
    with entity_context(db_session, entity.id):
        draft = db_session.scalar(select(InvoiceDraft))
        assert draft is not None
        draft.supplier_id = supplier_id
        draft.status = InvoiceDraftStatus.CONFIRMED
        draft.confirmed_by = ACTOR_ID
        db_session.commit()
        db_session.refresh(draft)
        return draft


def test_supplier_payment_correct_ties_ap_control(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier_id(db_session, restaurant_a)
    draft = _confirmed_draft(db_session, restaurant_a, supplier_id)
    ap_id = seeded_accounts[ACCOUNTS_PAYABLE_CODE]
    bank_id = seeded_accounts["1100"]

    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    payment = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=3_000_000,
        description="Partial payment",
        actor_id=ACTOR_ID,
        payment_account_id=bank_id,
    )

    from app.core.ledger.correction import correct_supplier_payment

    result = correct_supplier_payment(
        db_session,
        restaurant_a.id,
        payment.journal_entry.id,
        payment_date=date(2026, 2, 2),
        amount_kurus=3_500_000,
        description="Corrected payment",
        actor_id=ACTOR_ID,
        payment_account_id=bank_id,
        reason="Wrong amount",
    )

    assert result.original.status == JournalEntryStatus.VOIDED
    assert result.original.amended_by_entry_id == result.corrected.id
    assert result.corrected.amends_entry_id == result.original.id

    ap_gl = gl_liability_balance(db_session, restaurant_a.id, ap_id)
    subledger = supplier_subledger_total(db_session, restaurant_a.id)
    assert ap_gl == subledger == 8_500_000
    assert books_balanced(db_session, restaurant_a.id)

    with entity_context(db_session, restaurant_a.id):
        entries = list(db_session.scalars(select(JournalEntry)))
        assert len(entries) == 4  # invoice + voided payment + reversal + corrected


def test_customer_payment_correct_ties_ar_control(
    db_session, restaurant_a, seeded_accounts
) -> None:
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )
    with entity_context(db_session, restaurant_a.id):
        customer = Customer(name="Catering Co")
        db_session.add(customer)
        db_session.commit()
        db_session.refresh(customer)
        customer_id = customer.id

    ar_id = seeded_accounts[ACCOUNTS_RECEIVABLE_CODE]

    receivables_posting.post_credit_sale(
        db_session,
        restaurant_a.id,
        customer_id,
        sale_date=date(2026, 6, 1),
        amount_kurus=250_000,
        description="June invoice",
        actor_id=ACTOR_ID,
    )

    payment = receivables_posting.post_customer_payment(
        db_session,
        restaurant_a.id,
        customer_id,
        payment_date=date(2026, 6, 15),
        amount_kurus=100_000,
        description="Partial payment",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )

    from app.core.ledger.correction import correct_customer_payment

    correct_customer_payment(
        db_session,
        restaurant_a.id,
        payment.journal_entry.id,
        payment_date=date(2026, 6, 16),
        amount_kurus=150_000,
        description="Corrected payment",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )

    ar_gl = gl_asset_balance(db_session, restaurant_a.id, ar_id)
    subledger = customer_subledger_total(db_session, restaurant_a.id)
    assert ar_gl == subledger == 100_000
    assert books_balanced(db_session, restaurant_a.id)


def test_fx_purchase_correct_ties_fx_control(db_session, restaurant_a, seeded_accounts) -> None:
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Drawer"),
    )
    wallet = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency="USD",
            name="USD Wallet",
        ),
    )

    purchase = fx_posting.post_fx_purchase(
        db_session,
        restaurant_a.id,
        fx_money_account_id=wallet.id,
        try_cash_money_account_id=drawer.id,
        native_quantity=10_000,
        try_cost_kurus=350_000,
        purchase_date=date(2026, 5, 1),
        description="Buy USD",
        actor_id=ACTOR_ID,
    )

    from app.core.ledger.correction import correct_fx_purchase

    correct_fx_purchase(
        db_session,
        restaurant_a.id,
        purchase.journal_entry.id,
        purchase_date=date(2026, 5, 2),
        native_quantity=12_000,
        try_cost_kurus=420_000,
        description="Corrected buy",
        actor_id=ACTOR_ID,
    )

    subledger_total = fx_ledger.try_cost_balance_kurus(
        db_session, restaurant_a.id, wallet.id
    )
    with entity_context(db_session, restaurant_a.id):
        gl_balance = banking_service.gl_balance_kurus(
            db_session,
            wallet.gl_account_id,
            AccountNormalBalance.DEBIT,
        )
    assert subledger_total == gl_balance == 420_000
    assert books_balanced(db_session, restaurant_a.id)


def test_generic_correct_rejects_subledger_backed_entry(
    client: TestClient, db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier_id(db_session, restaurant_a)
    draft = _confirmed_draft(db_session, restaurant_a, supplier_id)
    bank_id = seeded_accounts["1100"]

    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    payment = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=1_000_000,
        description="Pay",
        actor_id=ACTOR_ID,
        payment_account_id=bank_id,
    )

    response = client.post(
        f"/entities/{restaurant_a.id}/ledger/entries/{payment.journal_entry.id}/correct",
        json={
            "entry_date": "2026-02-02",
            "description": "Should fail",
            "actor_id": str(ACTOR_ID),
            "lines": [
                {
                    "account_id": str(seeded_accounts[ACCOUNTS_PAYABLE_CODE]),
                    "amount_kurus": 1000000,
                    "side": "debit",
                },
                {
                    "account_id": str(bank_id),
                    "amount_kurus": 1000000,
                    "side": "credit",
                },
            ],
        },
    )
    assert response.status_code == 409
    assert "supplier payment correction" in response.json()["detail"]


def test_manual_entry_still_correctable_via_generic_endpoint(
    client: TestClient, restaurant_a, seeded_accounts
) -> None:
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts[ACCOUNTS_PAYABLE_CODE]

    post_response = client.post(
        f"/entities/{restaurant_a.id}/manual-journals",
        json={
            "entry_date": "2026-01-01",
            "description": "Manual for subledger guard",
            "actor_id": str(ACTOR_ID),
            "lines": [
                {"account_id": str(bank_id), "amount_kurus": 5000, "side": "debit"},
                {"account_id": str(ap_id), "amount_kurus": 5000, "side": "credit"},
            ],
        },
    )
    assert post_response.status_code == 201
    entry_id = post_response.json()["id"]

    correct_response = client.post(
        f"/entities/{restaurant_a.id}/ledger/entries/{entry_id}/correct",
        json={
            "entry_date": "2026-01-02",
            "description": "Corrected manual",
            "actor_id": str(ACTOR_ID),
            "lines": [
                {"account_id": str(bank_id), "amount_kurus": 7000, "side": "debit"},
                {"account_id": str(ap_id), "amount_kurus": 7000, "side": "credit"},
            ],
        },
    )
    assert correct_response.status_code == 200
    body = correct_response.json()
    assert body["corrected"]["source"] == "manual"


def test_generic_correct_rejects_opening_balance(
    client: TestClient, db_session, restaurant_a, seeded_accounts
) -> None:
    from app.core.onboarding.posting import post_opening_balances
    from app.features.onboarding.opening_balances import OpeningBalanceLineInput

    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )
    result = post_opening_balances(
        db_session,
        restaurant_a.id,
        go_live_date=date(2026, 1, 1),
        lines=[OpeningBalanceLineInput(money_account_id=bank.id, amount_kurus=100_000)],
        actor_id=ACTOR_ID,
    )
    entry_id = result.journal_entry.id
    ap_id = seeded_accounts[ACCOUNTS_PAYABLE_CODE]

    response = client.post(
        f"/entities/{restaurant_a.id}/ledger/entries/{entry_id}/correct",
        json={
            "entry_date": "2026-01-02",
            "description": "Should fail",
            "actor_id": str(ACTOR_ID),
            "lines": [
                {
                    "account_id": str(bank.gl_account_id),
                    "amount_kurus": 100000,
                    "side": "debit",
                },
                {
                    "account_id": str(ap_id),
                    "amount_kurus": 100000,
                    "side": "credit",
                },
            ],
        },
    )
    assert response.status_code == 409
    assert "void" in response.json()["detail"].lower()


def test_generic_correct_rejects_transfer(
    client: TestClient, db_session, restaurant_a, seeded_accounts
) -> None:
    from app.core.banking import posting as banking_posting

    bank_a = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Bank A",
            bank_name="Test Bank",
        ),
    )
    bank_b = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Bank B",
            bank_name="Test Bank",
        ),
    )
    ap_id = seeded_accounts[ACCOUNTS_PAYABLE_CODE]
    post_journal_entry(
        db_session,
        restaurant_a.id,
        date(2026, 1, 1),
        "Fund accounts",
        [
            PostingLine(bank_a.gl_account_id, 5_000_000, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 5_000_000, AccountNormalBalance.CREDIT),
        ],
        actor_id=ACTOR_ID,
        source=JournalEntrySource.MANUAL,
    )

    transfer = banking_posting.post_account_transfer(
        db_session,
        restaurant_a.id,
        from_money_account_id=bank_a.id,
        to_money_account_id=bank_b.id,
        transfer_date=date(2026, 2, 10),
        amount_kurus=1_000_000,
        description="Internal transfer",
        actor_id=ACTOR_ID,
    )
    entry_id = transfer.journal_entry.id

    response = client.post(
        f"/entities/{restaurant_a.id}/ledger/entries/{entry_id}/correct",
        json={
            "entry_date": "2026-02-11",
            "description": "Should fail",
            "actor_id": str(ACTOR_ID),
            "lines": [
                {
                    "account_id": str(bank_b.gl_account_id),
                    "amount_kurus": 1_000_000,
                    "side": "debit",
                },
                {
                    "account_id": str(bank_a.gl_account_id),
                    "amount_kurus": 1_000_000,
                    "side": "credit",
                },
            ],
        },
    )
    assert response.status_code == 409
    assert "void" in response.json()["detail"].lower()


def test_bank_fee_correctable_via_generic_endpoint(
    client: TestClient, db_session, restaurant_a, seeded_accounts
) -> None:
    from app.core.chart_of_accounts.default_chart import BANK_CHARGES_CODE
    from app.features.banking import statements as statement_service
    from app.features.banking.statement_models import (
        StatementLineClassification,
        StatementLineStatus,
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
    charges_id = seeded_accounts[BANK_CHARGES_CODE]
    csv = (
        "transaction_date,amount,description,reference\n"
        "2026-02-03,\"-250,00\",Bank service fee,FEE-FEB\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank.id,
        csv,
        original_filename="fee.csv",
    )
    fee_line = statement.lines[0]
    classified = statement_service.classify_statement_line(
        db_session,
        restaurant_a.id,
        statement.id,
        fee_line.id,
        classification=StatementLineClassification.BANK_FEE,
        actor_id=ACTOR_ID,
    )
    assert classified.line.status == StatementLineStatus.POSTED
    entry_id = classified.journal_entry_id
    assert entry_id is not None

    correct_response = client.post(
        f"/entities/{restaurant_a.id}/ledger/entries/{entry_id}/correct",
        json={
            "entry_date": "2026-02-04",
            "description": "Corrected bank fee",
            "actor_id": str(ACTOR_ID),
            "reason": "Wrong fee amount",
            "lines": [
                {
                    "account_id": str(charges_id),
                    "amount_kurus": 30000,
                    "side": "debit",
                },
                {
                    "account_id": str(bank.gl_account_id),
                    "amount_kurus": 30000,
                    "side": "credit",
                },
            ],
        },
    )
    assert correct_response.status_code == 200
    body = correct_response.json()
    assert body["original"]["status"] == "voided"
    assert body["corrected"]["source"] == "bank_fee"
    assert body["corrected"]["amends_entry_id"] == str(entry_id)


def test_security_invariant_subledger_correction_tie(
    db_session, restaurant_a, seeded_accounts
) -> None:
    """Permanent guard: after correction, AP control account matches subledger sum."""
    supplier_id = _supplier_id(db_session, restaurant_a)
    draft = _confirmed_draft(db_session, restaurant_a, supplier_id)
    ap_id = seeded_accounts[ACCOUNTS_PAYABLE_CODE]
    bank_id = seeded_accounts["1100"]

    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )
    payment = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 3, 1),
        amount_kurus=2_000_000,
        description="Pay",
        actor_id=ACTOR_ID,
        payment_account_id=bank_id,
    )

    from app.core.ledger.correction import correct_supplier_payment

    correct_supplier_payment(
        db_session,
        restaurant_a.id,
        payment.journal_entry.id,
        payment_date=date(2026, 3, 2),
        amount_kurus=2_500_000,
        description="Fixed pay",
        actor_id=ACTOR_ID,
        payment_account_id=bank_id,
    )

    assert gl_liability_balance(db_session, restaurant_a.id, ap_id) == supplier_subledger_total(
        db_session, restaurant_a.id
    )
