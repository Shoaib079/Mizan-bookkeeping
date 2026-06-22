"""Cash flow statement report (Phase 7 Slice 4)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.default_chart import ACCOUNTS_PAYABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.invoices.posting import post_confirmed_draft
from app.core.ledger.models import JournalEntrySource
from app.core.ledger.posting import PostingLine, post_journal_entry
from app.core.payables import posting as payables_posting
from app.core.onboarding.posting import post_opening_balances
from app.core.pos import posting as pos_posting
from app.core.banking import posting as banking_posting
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.expenses.models import ExpenseItem
from app.features.expenses import service as expense_service
from app.features.expenses.schema import ExpenseCreate
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus
from app.features.invoices import service as invoice_service
from app.features.reports import cash_flow
from app.features.onboarding.opening_balances import OpeningBalanceLineInput
from app.features.suppliers.models import Supplier
from app.features.suppliers import service as supplier_service
from app.features.suppliers.schema import SupplierCreate

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")
GO_LIVE = date(2026, 1, 1)
PERIOD_START = date(2026, 3, 1)
PERIOD_END = date(2026, 3, 31)
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"
SAMPLE_XML = FIXTURES / "sample.xml"


def _bank_payload(name: str) -> MoneyAccountCreate:
    return MoneyAccountCreate(
        account_kind=MoneyAccountKind.BANK,
        name=name,
        bank_name="Test Bank",
    )


@pytest.fixture
def cf_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    bank = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        _bank_payload("Garanti TRY"),
    )
    drawer = banking_service.create_money_account(
        db_session,
        restaurant_a.id,
        MoneyAccountCreate(account_kind=MoneyAccountKind.CASH, name="Main Drawer"),
    )
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "drawer": drawer,
        "accounts": accounts,
    }


@pytest.fixture
def transfer_cf_setup(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}

    bank_a = banking_service.create_money_account(
        db_session, restaurant_a.id, _bank_payload("Bank A")
    )
    bank_b = banking_service.create_money_account(
        db_session, restaurant_a.id, _bank_payload("Bank B")
    )
    ap_id = accounts["2000"]
    for bank in (bank_a, bank_b):
        post_journal_entry(
            db_session,
            restaurant_a.id,
            date(2026, 2, 28),
            "Fund bank",
            [
                PostingLine(bank.gl_account_id, 5_000_000, AccountNormalBalance.DEBIT),
                PostingLine(ap_id, 5_000_000, AccountNormalBalance.CREDIT),
            ],
            actor_id=ACTOR_ID,
            source=JournalEntrySource.MANUAL,
        )

    return {
        "entity_id": restaurant_a.id,
        "bank_a": bank_a,
        "bank_b": bank_b,
        "accounts": accounts,
    }


def _supplier_and_invoice(db_session, entity_id: uuid.UUID, accounts: dict) -> uuid.UUID:
    with entity_context(db_session, entity_id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        supplier_id = supplier.id

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

    post_confirmed_draft(
        db_session,
        entity_id,
        draft.id,
        expense_account_id=accounts["5200"],
        actor_id=ACTOR_ID,
    )
    return supplier_id


def test_pos_settlement_and_supplier_payment_operating_flow(
    db_session, cf_setup
) -> None:
    setup = cf_setup
    entity_id = setup["entity_id"]
    bank = setup["bank"]
    ap_id = setup["accounts"][ACCOUNTS_PAYABLE_CODE]

    post_journal_entry(
        db_session,
        entity_id,
        date(2026, 2, 28),
        "Opening bank funding",
        [
            PostingLine(bank.gl_account_id, 1_000_000, AccountNormalBalance.DEBIT),
            PostingLine(ap_id, 1_000_000, AccountNormalBalance.CREDIT),
        ],
        actor_id=ACTOR_ID,
        source=JournalEntrySource.MANUAL,
    )

    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 3, 5),
        amount_kurus=850_000,
        description="POS settlement",
        actor_id=ACTOR_ID,
    )

    supplier_id = _supplier_and_invoice(db_session, entity_id, setup["accounts"])
    payables_posting.post_supplier_payment(
        db_session,
        entity_id,
        supplier_id,
        payment_date=date(2026, 3, 10),
        amount_kurus=300_000,
        description="Supplier payment",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )

    report = cash_flow.get_cash_flow(
        db_session, entity_id, PERIOD_START, PERIOD_END
    )

    assert report.opening_cash_kurus == 1_000_000
    assert report.closing_cash_kurus == 1_550_000
    assert report.net_change_kurus == 550_000
    assert report.operating.inflows_kurus == 850_000
    assert report.operating.outflows_kurus == 300_000
    assert report.operating.net_kurus == 550_000
    assert report.investing.net_kurus == 0
    assert report.financing.net_kurus == 0
    assert report.reconciled_to_categories is True

    by_source = {row.source: row for row in report.by_source}
    assert by_source["pos_settlement"].net_cash_kurus == 850_000
    assert by_source["payment"].net_cash_kurus == -300_000


def test_account_transfer_does_not_change_entity_cash(
    db_session, transfer_cf_setup
) -> None:
    setup = transfer_cf_setup
    entity_id = setup["entity_id"]

    banking_posting.post_account_transfer(
        db_session,
        entity_id,
        from_money_account_id=setup["bank_a"].id,
        to_money_account_id=setup["bank_b"].id,
        transfer_date=date(2026, 3, 15),
        amount_kurus=2_000_000,
        description="Internal transfer",
        actor_id=ACTOR_ID,
    )

    report = cash_flow.get_cash_flow(
        db_session, entity_id, PERIOD_START, PERIOD_END
    )

    assert report.opening_cash_kurus == 10_000_000
    assert report.closing_cash_kurus == 10_000_000
    assert report.net_change_kurus == 0
    assert report.operating.net_kurus == 0
    assert "transfer" not in {row.source for row in report.by_source}
    assert report.reconciled_to_categories is True


def test_expense_entry_cash_outflow(db_session, cf_setup) -> None:
    setup = cf_setup
    entity_id = setup["entity_id"]
    rent_id = setup["accounts"]["5000"]

    with entity_context(db_session, entity_id):
        item = ExpenseItem(canonical_name="kira", canonical_name_normalized="kira")
        db_session.add(item)
        db_session.commit()
        db_session.refresh(item)
        item_id = item.id

    expense_service.create_expense(
        db_session,
        entity_id,
        ExpenseCreate(
            expense_date=date(2026, 3, 12),
            amount_kurus=75_000,
            expense_account_id=rent_id,
            money_account_id=setup["drawer"].id,
            written_item_description="kira",
            confirm_expense_item_id=item_id,
            has_source_document=False,
            description="Rent",
            actor_id=ACTOR_ID,
        ),
    )

    report = cash_flow.get_cash_flow(
        db_session, entity_id, PERIOD_START, PERIOD_END
    )

    assert report.operating.outflows_kurus == 75_000
    assert report.operating.inflows_kurus == 0
    assert report.operating.net_kurus == -75_000
    assert report.net_change_kurus == -75_000
    assert report.by_source[0].source == "expense_entry"
    assert report.by_source[0].net_cash_kurus == -75_000


def test_entry_outside_date_range_excluded_from_categorization(
    db_session, cf_setup
) -> None:
    setup = cf_setup
    entity_id = setup["entity_id"]
    bank = setup["bank"]

    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 4, 5),
        amount_kurus=400_000,
        description="April settlement",
        actor_id=ACTOR_ID,
    )

    report = cash_flow.get_cash_flow(
        db_session, entity_id, PERIOD_START, PERIOD_END
    )

    assert report.operating.inflows_kurus == 0
    assert report.operating.outflows_kurus == 0
    assert report.by_source == []
    assert report.net_change_kurus == 0


def test_cash_flow_invalid_date_range_returns_422(
    client: TestClient, restaurant_a
) -> None:
    response = client.get(
        f"/entities/{restaurant_a.id}/reports/cash-flow",
        params={"from": "2026-04-01", "to": "2026-03-01"},
    )
    assert response.status_code == 422


def test_cash_flow_api_e2e(db_session, client: TestClient, cf_setup) -> None:
    setup = cf_setup
    entity_id = setup["entity_id"]
    bank = setup["bank"]

    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 3, 8),
        amount_kurus=500_000,
        description="Settlement",
        actor_id=ACTOR_ID,
    )

    response = client.get(
        f"/entities/{entity_id}/reports/cash-flow",
        params={"from": "2026-03-01", "to": "2026-03-31"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["operating"]["inflows_kurus"] == 500_000
    assert body["net_change_kurus"] == 500_000
    assert body["reconciled_to_categories"] is True


def test_first_period_including_go_live_reconciles_categories(
    db_session, restaurant_a
) -> None:
    seed_default_chart(db_session, restaurant_a.id)
    entity_id = restaurant_a.id
    bank = banking_service.create_money_account(
        db_session,
        entity_id,
        _bank_payload("Garanti TRY"),
    )
    supplier = supplier_service.create_supplier(
        db_session,
        entity_id,
        SupplierCreate(name="Metro", vkn="1234567890"),
    )

    post_opening_balances(
        db_session,
        entity_id,
        go_live_date=GO_LIVE,
        lines=[
            OpeningBalanceLineInput(money_account_id=bank.id, amount_kurus=500_000),
            OpeningBalanceLineInput(supplier_id=supplier.id, amount_kurus=200_000),
        ],
        actor_id=ACTOR_ID,
    )

    pos_posting.post_pos_settlement(
        db_session,
        entity_id,
        money_account_id=bank.id,
        settlement_date=date(2026, 1, 15),
        amount_kurus=120_000,
        description="January POS settlement",
        actor_id=ACTOR_ID,
    )

    report = cash_flow.get_cash_flow(
        db_session, entity_id, GO_LIVE, date(2026, 1, 31)
    )

    assert report.opening_cash_kurus == 500_000
    assert report.closing_cash_kurus == 620_000
    assert report.net_change_kurus == 120_000
    assert report.operating.inflows_kurus == 120_000
    assert report.reconciled_to_categories is True
    assert "opening_balance" not in {row.source for row in report.by_source}


def test_cross_entity_isolation(
    db_session, client: TestClient, cf_setup, restaurant_b
) -> None:
    setup = cf_setup
    pos_posting.post_pos_settlement(
        db_session,
        setup["entity_id"],
        money_account_id=setup["bank"].id,
        settlement_date=date(2026, 3, 5),
        amount_kurus=200_000,
        description="Settlement",
        actor_id=ACTOR_ID,
    )
    seed_default_chart(db_session, restaurant_b.id)

    other = client.get(
        f"/entities/{restaurant_b.id}/reports/cash-flow",
        params={"from": "2026-03-01", "to": "2026-03-31"},
    )
    assert other.status_code == 200
    assert other.json()["net_change_kurus"] == 0
    assert other.json()["operating"]["inflows_kurus"] == 0

    missing = client.get(
        f"/entities/{uuid.uuid4()}/reports/cash-flow",
        params={"from": "2026-03-01", "to": "2026-03-31"},
    )
    assert missing.status_code == 404
