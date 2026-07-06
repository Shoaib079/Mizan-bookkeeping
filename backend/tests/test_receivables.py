"""Customer receivables — GL control account, no double-count (Phase 5 Slice 5)."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_RECEIVABLE_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.core.onboarding.posting import post_opening_balances
from app.core.receivables import ledger as receivables_ledger
from app.core.receivables import posting as receivables_posting
from app.core.receivables.models import CustomerLedgerEntry
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import StatementLineClassification
from app.features.customers.models import Customer
from app.features.onboarding.opening_balances import OpeningBalanceLineInput


ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def receivables_setup(db_session, restaurant_a):
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
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
        customer = Customer(name="Catering Co", identifier="CUST-001")
        db_session.add(customer)
        db_session.commit()
        db_session.refresh(customer)
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "accounts": accounts,
        "customer_id": customer.id,
    }


def _gl_balance(
    db_session,
    entity_id: uuid.UUID,
    account_id: uuid.UUID,
    normal: AccountNormalBalance,
) -> int:
    with entity_context(db_session, entity_id):
        rows = db_session.execute(
            select(JournalEntryLine.side, func.sum(JournalEntryLine.amount_kurus))
            .where(JournalEntryLine.account_id == account_id)
            .group_by(JournalEntryLine.side)
        ).all()
        debits = credits = 0
        for side, total in rows:
            if side == AccountNormalBalance.DEBIT:
                debits = int(total or 0)
            else:
                credits = int(total or 0)
        if normal == AccountNormalBalance.CREDIT:
            return credits - debits
        return debits - credits


def _revenue_total(db_session, entity_id: uuid.UUID, account_id: uuid.UUID) -> int:
    return _gl_balance(db_session, entity_id, account_id, AccountNormalBalance.CREDIT)


def _subledger_balance(db_session, entity_id: uuid.UUID, customer_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        total = db_session.scalar(
            select(func.coalesce(func.sum(CustomerLedgerEntry.amount_kurus), 0)).where(
                CustomerLedgerEntry.customer_id == customer_id
            )
        )
        return int(total or 0)


def test_credit_sale_dr_ar_cr_revenue(db_session, receivables_setup) -> None:
    entity_id = receivables_setup["entity_id"]
    customer_id = receivables_setup["customer_id"]
    accounts = receivables_setup["accounts"]

    result = receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_id,
        sale_date=date(2026, 6, 1),
        amount_kurus=250_000,
        description="June catering invoice",
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.CUSTOMER_CREDIT_SALE
    assert result.balance_kurus == 250_000
    assert _revenue_total(db_session, entity_id, accounts[SALES_REVENUE_CODE]) == 250_000
    assert _gl_balance(
        db_session,
        entity_id,
        accounts[ACCOUNTS_RECEIVABLE_CODE],
        AccountNormalBalance.DEBIT,
    ) == 250_000
    assert _subledger_balance(db_session, entity_id, customer_id) == 250_000


def test_payment_received_dr_bank_no_revenue(db_session, receivables_setup) -> None:
    entity_id = receivables_setup["entity_id"]
    customer_id = receivables_setup["customer_id"]
    accounts = receivables_setup["accounts"]
    bank = receivables_setup["bank"]

    receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_id,
        sale_date=date(2026, 6, 1),
        amount_kurus=250_000,
        description="June catering invoice",
        actor_id=ACTOR_ID,
    )

    result = receivables_posting.post_customer_payment(
        db_session,
        entity_id,
        customer_id,
        payment_date=date(2026, 6, 15),
        amount_kurus=250_000,
        description="Payment received",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )

    assert result.journal_entry.source == JournalEntrySource.CUSTOMER_PAYMENT_RECEIVED
    assert _revenue_total(db_session, entity_id, accounts[SALES_REVENUE_CODE]) == 250_000
    assert _gl_balance(
        db_session,
        entity_id,
        accounts[ACCOUNTS_RECEIVABLE_CODE],
        AccountNormalBalance.DEBIT,
    ) == 0
    assert _subledger_balance(db_session, entity_id, customer_id) == 0

    with entity_context(db_session, entity_id):
        lines = db_session.scalars(
            select(JournalEntryLine).where(
                JournalEntryLine.journal_entry_id == result.journal_entry.id
            )
        ).all()
        revenue_lines = [
            line for line in lines if line.account_id == accounts[SALES_REVENUE_CODE]
        ]
        assert revenue_lines == []


def test_control_account_reconciles_subledger_sum(db_session, receivables_setup) -> None:
    entity_id = receivables_setup["entity_id"]
    accounts = receivables_setup["accounts"]
    bank = receivables_setup["bank"]

    with entity_context(db_session, entity_id):
        customer_b = Customer(name="Events Ltd")
        db_session.add(customer_b)
        db_session.commit()
        customer_b_id = customer_b.id

    receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        receivables_setup["customer_id"],
        sale_date=date(2026, 6, 1),
        amount_kurus=100_000,
        description="Sale A",
        actor_id=ACTOR_ID,
    )
    receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_b_id,
        sale_date=date(2026, 6, 2),
        amount_kurus=50_000,
        description="Sale B",
        actor_id=ACTOR_ID,
    )
    receivables_posting.post_customer_payment(
        db_session,
        entity_id,
        receivables_setup["customer_id"],
        payment_date=date(2026, 6, 10),
        amount_kurus=40_000,
        description="Partial pay",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )

    gl_ar = _gl_balance(
        db_session,
        entity_id,
        accounts[ACCOUNTS_RECEIVABLE_CODE],
        AccountNormalBalance.DEBIT,
    )
    subledger_total = receivables_ledger.entity_total_balance_kurus(db_session, entity_id)
    assert gl_ar == subledger_total == 110_000


def test_payment_overpayment_rejected(db_session, receivables_setup) -> None:
    entity_id = receivables_setup["entity_id"]
    customer_id = receivables_setup["customer_id"]
    bank = receivables_setup["bank"]

    receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_id,
        sale_date=date(2026, 6, 1),
        amount_kurus=50_000,
        description="Small sale",
        actor_id=ACTOR_ID,
    )

    with pytest.raises(receivables_ledger.OverpaymentError):
        receivables_posting.post_customer_payment(
            db_session,
            entity_id,
            customer_id,
            payment_date=date(2026, 6, 5),
            amount_kurus=60_000,
            description="Too much",
            actor_id=ACTOR_ID,
            payment_account_id=bank.gl_account_id,
        )


def test_customer_ledger_immutable(db_session, receivables_setup) -> None:
    entity_id = receivables_setup["entity_id"]
    customer_id = receivables_setup["customer_id"]

    receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_id,
        sale_date=date(2026, 6, 1),
        amount_kurus=10_000,
        description="Sale",
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        entry = db_session.scalar(select(CustomerLedgerEntry).limit(1))
        assert entry is not None
        with pytest.raises(Exception, match="immutable"):
            entry.amount_kurus = 1
            db_session.flush()


def test_opening_balance_customer_id_lines(db_session, receivables_setup) -> None:
    entity_id = receivables_setup["entity_id"]
    accounts = receivables_setup["accounts"]

    with entity_context(db_session, entity_id):
        customer_b = Customer(name="OB Customer")
        db_session.add(customer_b)
        db_session.commit()
        customer_b_id = customer_b.id

    result = post_opening_balances(
        db_session,
        entity_id,
        go_live_date=date(2026, 1, 1),
        lines=[
            OpeningBalanceLineInput(
                customer_id=receivables_setup["customer_id"], amount_kurus=80_000
            ),
            OpeningBalanceLineInput(customer_id=customer_b_id, amount_kurus=30_000),
        ],
        actor_id=ACTOR_ID,
    )

    assert len(result.customer_ledger_entries) == 2
    gl_ar = _gl_balance(
        db_session,
        entity_id,
        accounts[ACCOUNTS_RECEIVABLE_CODE],
        AccountNormalBalance.DEBIT,
    )
    subledger_total = receivables_ledger.entity_total_balance_kurus(db_session, entity_id)
    assert gl_ar == subledger_total == 110_000


def test_classify_customer_payment_bank_inflow(
    db_session, receivables_setup, isolated_upload_dir
) -> None:
    entity_id = receivables_setup["entity_id"]
    customer_id = receivables_setup["customer_id"]
    bank = receivables_setup["bank"]

    receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_id,
        sale_date=date(2026, 5, 1),
        amount_kurus=75_000,
        description="Prior sale",
        actor_id=ACTOR_ID,
    )

    csv_content = (
        "transaction_date,amount,description,reference\n"
        "2026-06-20,\"750,00\",Customer payment,REF-CP-1\n"
    ).encode()
    statement = statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank.id,
        csv_content,
        original_filename="inflow.csv",
    )
    line_id = statement.lines[0].id

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        line_id,
        classification=StatementLineClassification.CUSTOMER_PAYMENT,
        customer_id=customer_id,
        actor_id=ACTOR_ID,
    )

    assert result.line.classification == StatementLineClassification.CUSTOMER_PAYMENT
    assert result.line.status.value == "posted"
    assert result.journal_entry_id is not None
    assert _subledger_balance(db_session, entity_id, customer_id) == 0


def test_api_customers_and_receivables_summary(
    client: TestClient, db_session, receivables_setup
) -> None:
    entity_id = receivables_setup["entity_id"]
    bank = receivables_setup["bank"]

    create_resp = client.post(
        f"/entities/{entity_id}/customers",
        json={"name": "API Customer", "identifier": "API-1"},
    )
    assert create_resp.status_code == 201
    customer_id = create_resp.json()["id"]

    sale_resp = client.post(
        f"/entities/{entity_id}/customers/{customer_id}/credit-sales",
        json={
            "sale_date": "2026-06-01",
            "amount_kurus": 120_000,
            "description": "API sale",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert sale_resp.status_code == 201

    pay_resp = client.post(
        f"/entities/{entity_id}/customers/{customer_id}/payments",
        json={
            "payment_date": "2026-06-10",
            "amount_kurus": 50_000,
            "description": "API payment",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(bank.gl_account_id),
        },
    )
    assert pay_resp.status_code == 201

    summary_resp = client.get(f"/entities/{entity_id}/receivables")
    assert summary_resp.status_code == 200
    body = summary_resp.json()
    assert body["total_receivables_kurus"] == 70_000
    assert len(body["customers"]) == 1
    assert body["customers"][0]["customer_name"] == "API Customer"

    ledger_resp = client.get(f"/entities/{entity_id}/customers/{customer_id}/ledger")
    assert ledger_resp.status_code == 200
    assert ledger_resp.json()["balance_kurus"] == 70_000
    assert len(ledger_resp.json()["entries"]) == 2


def test_group_credit_sale_pax_try_and_forex_metadata(
    db_session, receivables_setup
) -> None:
    entity_id = receivables_setup["entity_id"]
    customer_id = receivables_setup["customer_id"]

    result = receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_id,
        sale_date=date(2026, 7, 1),
        amount_kurus=450_000,
        description="Agency lunch",
        actor_id=ACTOR_ID,
        pax=45,
        rate_per_person_kurus=10_000,
        forex_currency="USD",
        rate_per_person_forex_minor=2_500,
        total_forex_minor=112_500,
    )

    entry = result.customer_ledger_entry
    assert entry.pax == 45
    assert entry.rate_per_person_kurus == 10_000
    assert entry.forex_currency == "USD"
    assert entry.rate_per_person_forex_minor == 2_500
    assert entry.total_forex_minor == 112_500
    assert result.balance_kurus == 450_000


def test_customer_payment_fx_wallet_receipt(db_session, receivables_setup) -> None:
    entity_id = receivables_setup["entity_id"]
    customer_id = receivables_setup["customer_id"]

    fx_wallet = banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.FOREIGN_CURRENCY,
            currency="USD",
            name="USD Agency Wallet",
        ),
    )

    receivables_posting.post_credit_sale(
        db_session,
        entity_id,
        customer_id,
        sale_date=date(2026, 7, 1),
        amount_kurus=350_000,
        description="Group invoice",
        actor_id=ACTOR_ID,
    )

    result = receivables_posting.post_customer_payment(
        db_session,
        entity_id,
        customer_id,
        payment_date=date(2026, 7, 10),
        amount_kurus=350_000,
        description="USD wire received",
        actor_id=ACTOR_ID,
        payment_account_id=fx_wallet.gl_account_id,
        payment_native_quantity=10_000,
    )

    entry = result.customer_ledger_entry
    assert entry.forex_currency == "USD"
    assert entry.payment_native_quantity == 10_000
    assert result.balance_kurus == 0

    from app.core.fx.models import FxLedgerEntry
    from app.core.fx.types import FxMovementType

    with entity_context(db_session, entity_id):
        fx_row = db_session.scalar(
            select(FxLedgerEntry).where(
                FxLedgerEntry.journal_entry_id == result.journal_entry.id
            )
        )
        assert fx_row is not None
        assert fx_row.movement_type == FxMovementType.RECEIPT
        assert fx_row.native_quantity == 10_000


def test_api_customer_optional_tax_id(client: TestClient, receivables_setup) -> None:
    entity_id = receivables_setup["entity_id"]

    create_resp = client.post(
        f"/entities/{entity_id}/customers",
        json={
            "name": "Agency Tours Ltd",
            "tax_id": "1234567890",
            "contact_name": "Ayşe Kaya",
            "phone": "+90 532 000 0000",
        },
    )
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["tax_id"] == "1234567890"
    assert body["contact_name"] == "Ayşe Kaya"
    assert body["phone"] == "+90 532 000 0000"

    group_sale_resp = client.post(
        f"/entities/{entity_id}/customers/{body['id']}/credit-sales",
        json={
            "sale_date": "2026-07-01",
            "amount_kurus": 200_000,
            "description": "Group sale",
            "actor_id": str(ACTOR_ID),
            "pax": 20,
            "rate_per_person_kurus": 10_000,
            "forex_currency": "EUR",
            "rate_per_person_forex_minor": 2_000,
        },
    )
    assert group_sale_resp.status_code == 201
    sale_body = group_sale_resp.json()
    assert sale_body["customer_ledger_entry"]["pax"] == 20
    assert sale_body["customer_ledger_entry"]["forex_currency"] == "EUR"
    assert sale_body["balance_kurus"] == 200_000
