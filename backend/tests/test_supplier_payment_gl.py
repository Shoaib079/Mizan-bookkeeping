"""Supplier payment GL posting + AP control-account reconciliation (Phase 2)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import ACCOUNTS_PAYABLE_CODE
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.invoices.posting import post_confirmed_draft
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError
from app.core.payables import posting as payables_posting
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus
from app.features.invoices import service as invoice_service
from app.features.suppliers.models import Supplier

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


def _gl_liability_balance(
    db_session, entity_id: uuid.UUID, account_id: uuid.UUID
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
        return credits - debits


def _gl_asset_balance(db_session, entity_id: uuid.UUID, account_id: uuid.UUID) -> int:
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
        return debits - credits


def _total_subledger_balance(db_session, entity_id: uuid.UUID) -> int:
    with entity_context(db_session, entity_id):
        total = db_session.scalar(
            select(func.coalesce(func.sum(SupplierLedgerEntry.amount_kurus), 0))
        )
        return int(total or 0)


def test_invoice_payment_gl_ap_matches_subledger_total(
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

    payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=5_000_000,
        description="Partial payment",
        actor_id=ACTOR_ID,
        payment_account_id=bank_id,
    )

    ap_gl = _gl_liability_balance(db_session, restaurant_a.id, ap_id)
    subledger_total = _total_subledger_balance(db_session, restaurant_a.id)
    assert ap_gl == subledger_total == 7_000_000


def test_payment_credits_bank_account(
    db_session, restaurant_a, seeded_accounts
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

    payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=3_000_000,
        description="Bank pay",
        actor_id=ACTOR_ID,
        payment_account_id=bank_id,
    )

    bank_balance = _gl_asset_balance(db_session, restaurant_a.id, bank_id)
    assert bank_balance == -3_000_000


def test_payment_links_journal_entry_on_subledger_row(
    db_session, restaurant_a, seeded_accounts
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

    result = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=1_000_000,
        description="Linked pay",
        actor_id=ACTOR_ID,
        payment_account_id=bank_id,
    )

    assert result.journal_entry.source == JournalEntrySource.PAYMENT
    assert result.supplier_ledger_entry.journal_entry_id == result.journal_entry.id
    assert result.supplier_ledger_entry.movement_type == SupplierMovementType.PAYMENT


def test_non_asset_payment_account_rejected(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier_id(db_session, restaurant_a)
    draft = _confirmed_draft(db_session, restaurant_a, supplier_id)

    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    with pytest.raises(InvalidAccountError, match="asset"):
        payables_posting.post_supplier_payment(
            db_session,
            restaurant_a.id,
            supplier_id,
            payment_date=date(2026, 2, 1),
            amount_kurus=100_000,
            description="Bad account",
            actor_id=ACTOR_ID,
            payment_account_id=seeded_accounts["5200"],
        )


def test_api_payment_requires_payment_account_and_ties_control_account(
    client: TestClient,
    db_session,
    restaurant_a,
    seeded_accounts,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.config.settings.upload_dir", str(tmp_path / "uploads"))
    supplier_id = _supplier_id(db_session, restaurant_a)
    draft = _confirmed_draft(db_session, restaurant_a, supplier_id)
    bank_id = seeded_accounts["1100"]
    ap_id = seeded_accounts[ACCOUNTS_PAYABLE_CODE]

    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    response = client.post(
        f"/entities/{restaurant_a.id}/suppliers/{supplier_id}/payments",
        json={
            "payment_date": "2026-02-01",
            "amount_kurus": 2_000_000,
            "description": "API pay",
            "actor_id": str(ACTOR_ID),
            "payment_account_id": str(bank_id),
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["journal_entry_id"]
    assert body["supplier_ledger_entry"]["journal_entry_id"] == body["journal_entry_id"]
    assert body["payable_balance_kurus"] == 10_000_000

    ap_gl = _gl_liability_balance(db_session, restaurant_a.id, ap_id)
    subledger_total = _total_subledger_balance(db_session, restaurant_a.id)
    assert ap_gl == subledger_total == 10_000_000
