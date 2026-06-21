"""Bank statement CSV import + supplier payment classification (Phase 3 Slice 2)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.invoices.posting import post_confirmed_draft
from app.core.ledger.models import JournalEntry, JournalEntryLine
from app.core.payables import posting as payables_posting
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import BankStatementRead, MoneyAccountCreate
from app.features.banking.statement_models import (
    StatementLineClassification,
    StatementLineStatus,
)
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus
from app.features.invoices import service as invoice_service
from app.features.suppliers.models import Supplier

FIXTURES = Path(__file__).resolve().parent / "fixtures"
SAMPLE_CSV = FIXTURES / "bank_statements" / "sample.csv"
EFATURA_XML = FIXTURES / "efatura" / "sample.xml"
ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    return restaurant_a.id


@pytest.fixture
def upload_dir(tmp_path, monkeypatch):
    path = tmp_path / "uploads"
    monkeypatch.setattr("app.config.settings.upload_dir", str(path))
    return path


def _bank_account(db_session, entity_id):
    return banking_service.create_money_account(
        db_session,
        entity_id,
        MoneyAccountCreate(
            account_kind=MoneyAccountKind.BANK,
            name="Garanti TRY",
            bank_name="Garanti BBVA",
        ),
    )


def _supplier_and_payable(db_session, entity, accounts) -> uuid.UUID:
    with entity_context(db_session, entity.id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        supplier_id = supplier.id

    content = EFATURA_XML.read_bytes()
    invoice_service.create_efatura_draft_from_upload(db_session, entity.id, content)
    with entity_context(db_session, entity.id):
        draft = db_session.scalar(select(InvoiceDraft))
        assert draft is not None
        draft.supplier_id = supplier_id
        draft.status = InvoiceDraftStatus.CONFIRMED
        draft.confirmed_by = ACTOR_ID
        db_session.commit()
        db_session.refresh(draft)

    post_confirmed_draft(
        db_session,
        entity.id,
        draft.id,
        expense_account_id=accounts["5200"],
        actor_id=ACTOR_ID,
    )
    return supplier_id


def _import_sample(db_session, entity_id, bank_account_id) -> BankStatementRead:
    content = SAMPLE_CSV.read_bytes()
    return statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_account_id,
        content,
        original_filename="sample.csv",
    )


@pytest.fixture
def bank_setup(db_session, restaurant_a, seeded_accounts, upload_dir):
    bank = _bank_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {account.code: account.id for account in db_session.scalars(select(Account))}
    supplier_id = _supplier_and_payable(db_session, restaurant_a, accounts)
    statement = _import_sample(db_session, restaurant_a.id, bank.id)
    return {
        "entity_id": restaurant_a.id,
        "bank": bank,
        "supplier_id": supplier_id,
        "accounts": accounts,
        "statement": statement,
    }


def test_import_csv_stores_lines(bank_setup) -> None:
    statement = bank_setup["statement"]
    assert statement.line_count == 3
    assert statement.period_start.isoformat() == "2026-02-01"
    assert statement.period_end.isoformat() == "2026-02-05"
    assert len(statement.lines) == 3
    assert statement.lines[0].amount_kurus == -5_000_000
    assert statement.lines[0].status == StatementLineStatus.IMPORTED
    assert statement.lines[0].classification == StatementLineClassification.UNCLASSIFIED


def test_duplicate_fingerprint_rejected(
    db_session, restaurant_a, seeded_accounts, upload_dir
) -> None:
    bank = _bank_account(db_session, restaurant_a.id)
    content = SAMPLE_CSV.read_bytes()
    statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank.id,
        content,
        original_filename="sample.csv",
    )
    with pytest.raises(statement_service.DuplicateStatementError):
        statement_service.import_bank_statement(
            db_session,
            restaurant_a.id,
            bank.id,
            content,
            original_filename="sample-copy.csv",
        )


def test_classify_supplier_payment_posts_gl_and_subledger(
    db_session, bank_setup
) -> None:
    entity_id = bank_setup["entity_id"]
    statement = bank_setup["statement"]
    payment_line = statement.lines[0]

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        payment_line.id,
        classification=StatementLineClassification.SUPPLIER_PAYMENT,
        supplier_id=bank_setup["supplier_id"],
        actor_id=ACTOR_ID,
    )

    assert result.linked_existing_payment is False
    assert result.line.status == StatementLineStatus.POSTED
    assert result.journal_entry_id is not None

    with entity_context(db_session, entity_id):
        journal_count = db_session.scalar(select(func.count()).select_from(JournalEntry))
        payment_entries = db_session.scalars(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.movement_type == SupplierMovementType.PAYMENT
            )
        ).all()
        bank_balance = banking_service.gl_balance_kurus(
            db_session,
            bank_setup["bank"].gl_account_id,
            AccountNormalBalance.DEBIT,
        )
    assert journal_count == 2
    assert len(payment_entries) == 1
    assert payment_entries[0].reference_type == "bank_statement_line"
    assert payment_entries[0].reference_id == payment_line.id
    assert bank_balance == -5_000_000


def test_classify_links_existing_manual_payment(
    db_session, restaurant_a, seeded_accounts, upload_dir
) -> None:
    bank = _bank_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    supplier_id = _supplier_and_payable(db_session, restaurant_a, accounts)

    manual = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 1),
        amount_kurus=5_000_000,
        description="Manual EFT",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )
    manual_journal_id = manual.journal_entry.id
    manual_ledger_id = manual.supplier_ledger_entry.id

    statement = _import_sample(db_session, restaurant_a.id, bank.id)
    payment_line = statement.lines[0]

    with entity_context(db_session, restaurant_a.id):
        journal_before = db_session.scalar(select(func.count()).select_from(JournalEntry))

    result = statement_service.classify_statement_line(
        db_session,
        restaurant_a.id,
        statement.id,
        payment_line.id,
        classification=StatementLineClassification.SUPPLIER_PAYMENT,
        supplier_id=supplier_id,
        actor_id=ACTOR_ID,
    )

    assert result.linked_existing_payment is True
    assert result.line.status == StatementLineStatus.LINKED
    assert result.journal_entry_id == manual_journal_id
    assert result.line.supplier_ledger_entry_id == manual_ledger_id

    with entity_context(db_session, restaurant_a.id):
        journal_after = db_session.scalar(select(func.count()).select_from(JournalEntry))
        payment_count = db_session.scalar(
            select(func.count())
            .select_from(SupplierLedgerEntry)
            .where(SupplierLedgerEntry.movement_type == SupplierMovementType.PAYMENT)
        )
    assert journal_after == journal_before
    assert payment_count == 1


def test_classify_near_match_payment_routes_to_needs_review(
    db_session, restaurant_a, seeded_accounts, upload_dir
) -> None:
    bank = _bank_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    supplier_id = _supplier_and_payable(db_session, restaurant_a, accounts)

    manual = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 2),
        amount_kurus=5_000_000,
        description="Manual EFT",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )
    manual_ledger_id = manual.supplier_ledger_entry.id

    statement = _import_sample(db_session, restaurant_a.id, bank.id)
    payment_line = statement.lines[0]
    assert payment_line.transaction_date == date(2026, 2, 1)

    with entity_context(db_session, restaurant_a.id):
        journal_before = db_session.scalar(select(func.count()).select_from(JournalEntry))

    result = statement_service.classify_statement_line(
        db_session,
        restaurant_a.id,
        statement.id,
        payment_line.id,
        classification=StatementLineClassification.SUPPLIER_PAYMENT,
        supplier_id=supplier_id,
        actor_id=ACTOR_ID,
    )

    assert result.routed_to_needs_review is True
    assert result.line.status == StatementLineStatus.NEEDS_REVIEW
    assert result.line.candidate_supplier_ledger_entry_id == manual_ledger_id
    assert result.journal_entry_id is None

    with entity_context(db_session, restaurant_a.id):
        journal_after = db_session.scalar(select(func.count()).select_from(JournalEntry))
    assert journal_after == journal_before


def test_confirm_needs_review_payment_links_without_new_journal(
    db_session, restaurant_a, seeded_accounts, upload_dir
) -> None:
    bank = _bank_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    supplier_id = _supplier_and_payable(db_session, restaurant_a, accounts)

    manual = payables_posting.post_supplier_payment(
        db_session,
        restaurant_a.id,
        supplier_id,
        payment_date=date(2026, 2, 3),
        amount_kurus=5_000_000,
        description="Manual EFT",
        actor_id=ACTOR_ID,
        payment_account_id=bank.gl_account_id,
    )

    manual_ledger_id = manual.supplier_ledger_entry.id

    statement = _import_sample(db_session, restaurant_a.id, bank.id)
    payment_line = statement.lines[0]

    review = statement_service.classify_statement_line(
        db_session,
        restaurant_a.id,
        statement.id,
        payment_line.id,
        classification=StatementLineClassification.SUPPLIER_PAYMENT,
        supplier_id=supplier_id,
        actor_id=ACTOR_ID,
    )
    assert review.routed_to_needs_review is True

    with entity_context(db_session, restaurant_a.id):
        journal_before = db_session.scalar(select(func.count()).select_from(JournalEntry))

    confirmed = statement_service.classify_statement_line(
        db_session,
        restaurant_a.id,
        statement.id,
        payment_line.id,
        classification=StatementLineClassification.SUPPLIER_PAYMENT,
        confirm_supplier_ledger_entry_id=manual_ledger_id,
    )

    assert confirmed.line.status == StatementLineStatus.LINKED
    assert confirmed.linked_existing_payment is True
    assert confirmed.line.supplier_ledger_entry_id == manual_ledger_id

    with entity_context(db_session, restaurant_a.id):
        journal_after = db_session.scalar(select(func.count()).select_from(JournalEntry))
    assert journal_after == journal_before


def test_double_classify_posted_line_rejected(db_session, bank_setup) -> None:
    entity_id = bank_setup["entity_id"]
    statement = bank_setup["statement"]
    payment_line = statement.lines[0]

    statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        payment_line.id,
        classification=StatementLineClassification.SUPPLIER_PAYMENT,
        supplier_id=bank_setup["supplier_id"],
        actor_id=ACTOR_ID,
    )

    with pytest.raises(statement_service.LineAlreadyResolvedError):
        statement_service.classify_statement_line(
            db_session,
            entity_id,
            statement.id,
            payment_line.id,
            classification=StatementLineClassification.BANK_FEE,
        )


def test_bank_fee_classification_no_journal(db_session, bank_setup) -> None:
    """Unknown stays classify-only; bank_fee now posts GL — see test_statement_event_posting."""
    entity_id = bank_setup["entity_id"]
    statement = bank_setup["statement"]
    refund_line = statement.lines[2]

    with entity_context(db_session, entity_id):
        journal_before = db_session.scalar(select(func.count()).select_from(JournalEntry))

    result = statement_service.classify_statement_line(
        db_session,
        entity_id,
        statement.id,
        refund_line.id,
        classification=StatementLineClassification.UNKNOWN,
    )

    assert result.line.status == StatementLineStatus.CLASSIFIED
    assert result.journal_entry_id is None

    with entity_context(db_session, entity_id):
        journal_after = db_session.scalar(select(func.count()).select_from(JournalEntry))
    assert journal_after == journal_before


def test_cross_entity_isolation(
    db_session, restaurant_a, restaurant_b, seeded_accounts, upload_dir
) -> None:
    seed_default_chart(db_session, restaurant_b.id)
    bank = _bank_account(db_session, restaurant_a.id)
    statement = _import_sample(db_session, restaurant_a.id, bank.id)

    with pytest.raises(LookupError):
        statement_service.get_bank_statement(db_session, restaurant_b.id, statement.id)


def test_api_import_and_classify(
    client: TestClient,
    db_session,
    restaurant_a,
    seeded_accounts,
    upload_dir,
) -> None:
    bank = _bank_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    supplier_id = _supplier_and_payable(db_session, restaurant_a, accounts)

    import_resp = client.post(
        f"/entities/{restaurant_a.id}/banking/accounts/{bank.id}/statements",
        files={"file": ("sample.csv", SAMPLE_CSV.read_bytes(), "text/csv")},
    )
    assert import_resp.status_code == 201
    body = import_resp.json()
    statement_id = body["id"]
    line_id = body["lines"][0]["id"]

    dup_resp = client.post(
        f"/entities/{restaurant_a.id}/banking/accounts/{bank.id}/statements",
        files={"file": ("sample.csv", SAMPLE_CSV.read_bytes(), "text/csv")},
    )
    assert dup_resp.status_code == 409

    classify_resp = client.patch(
        f"/entities/{restaurant_a.id}/banking/statements/{statement_id}/lines/{line_id}/classify",
        json={
            "classification": "supplier_payment",
            "supplier_id": str(supplier_id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert classify_resp.status_code == 200
    assert classify_resp.json()["line"]["status"] == "posted"

    get_resp = client.get(
        f"/entities/{restaurant_a.id}/banking/statements/{statement_id}"
    )
    assert get_resp.status_code == 200
    assert get_resp.json()["lines"][0]["status"] == "posted"

    list_resp = client.get(
        f"/entities/{restaurant_a.id}/banking/accounts/{bank.id}/statements"
    )
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1
