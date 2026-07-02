"""Discard bank statement import — remove one file without touching company data."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.invoices.posting import post_confirmed_draft
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.banking import statements as statement_service
from app.features.banking.models import MoneyAccountKind
from app.features.banking.schema import MoneyAccountCreate
from app.features.banking.statement_models import (
    BankStatement,
    BankStatementLine,
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


def _import_sample(db_session, entity_id, bank_account_id):
    return statement_service.import_bank_statement(
        db_session,
        entity_id,
        bank_account_id,
        SAMPLE_CSV.read_bytes(),
        original_filename="sample.csv",
    )


def _supplier_and_payable(db_session, entity, accounts) -> uuid.UUID:
    with entity_context(db_session, entity.id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        supplier_id = supplier.id

    invoice_service.create_efatura_draft_from_upload(
        db_session, entity.id, EFATURA_XML.read_bytes()
    )
    with entity_context(db_session, entity.id):
        draft = db_session.scalar(select(InvoiceDraft))
        assert draft is not None
        draft.supplier_id = supplier_id
        draft.status = InvoiceDraftStatus.CONFIRMED
        draft.confirmed_by = ACTOR_ID
        db_session.commit()
        db_session.refresh(draft)
        draft_id = draft.id

    post_confirmed_draft(
        db_session,
        entity.id,
        draft_id,
        expense_account_id=accounts["5200"],
        actor_id=ACTOR_ID,
    )
    return supplier_id


def test_discard_unposted_statement_frees_fingerprint(
    db_session, restaurant_a, seeded_accounts
) -> None:
    bank = _bank_account(db_session, restaurant_a.id)
    statement = _import_sample(db_session, restaurant_a.id, bank.id)
    content = SAMPLE_CSV.read_bytes()

    result = statement_service.discard_bank_statement(
        db_session, restaurant_a.id, statement.id
    )
    assert result.original_filename == "sample.csv"
    assert result.line_count == 3

    with pytest.raises(LookupError):
        statement_service.get_bank_statement(db_session, restaurant_a.id, statement.id)

    with entity_context(db_session, restaurant_a.id):
        assert db_session.get(BankStatement, statement.id) is None
        assert (
            db_session.scalar(
                select(BankStatementLine).where(
                    BankStatementLine.statement_id == statement.id
                )
            )
            is None
        )

    reimported = statement_service.import_bank_statement(
        db_session,
        restaurant_a.id,
        bank.id,
        content,
        original_filename="sample.csv",
    )
    assert reimported.line_count == 3


def test_discard_allows_skipped_unknown_lines(
    db_session, restaurant_a, seeded_accounts
) -> None:
    bank = _bank_account(db_session, restaurant_a.id)
    statement = _import_sample(db_session, restaurant_a.id, bank.id)
    line_id = statement.lines[0].id

    statement_service.classify_statement_line(
        db_session,
        restaurant_a.id,
        statement.id,
        line_id,
        classification=StatementLineClassification.UNKNOWN,
    )

    statement_service.discard_bank_statement(db_session, restaurant_a.id, statement.id)

    with pytest.raises(LookupError):
        statement_service.get_bank_statement(db_session, restaurant_a.id, statement.id)


def test_discard_blocked_when_line_posted(
    db_session, restaurant_a, seeded_accounts
) -> None:
    bank = _bank_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    supplier_id = _supplier_and_payable(db_session, restaurant_a, accounts)
    statement = _import_sample(db_session, restaurant_a.id, bank.id)

    statement_service.classify_statement_line(
        db_session,
        restaurant_a.id,
        statement.id,
        statement.lines[0].id,
        classification=StatementLineClassification.SUPPLIER_PAYMENT,
        supplier_id=supplier_id,
        actor_id=ACTOR_ID,
    )

    with pytest.raises(statement_service.StatementNotDiscardableError) as exc:
        statement_service.discard_bank_statement(
            db_session, restaurant_a.id, statement.id
        )
    assert exc.value.posted_count == 1

    still = statement_service.get_bank_statement(
        db_session, restaurant_a.id, statement.id
    )
    assert still.line_count == 3


def test_api_discard_unposted_statement(
    client: TestClient, db_session, restaurant_a, seeded_accounts
) -> None:
    bank = _bank_account(db_session, restaurant_a.id)
    statement = _import_sample(db_session, restaurant_a.id, bank.id)

    resp = client.delete(
        f"/entities/{restaurant_a.id}/banking/statements/{statement.id}"
    )
    assert resp.status_code == 200
    assert resp.json()["line_count"] == 3

    get_resp = client.get(
        f"/entities/{restaurant_a.id}/banking/statements/{statement.id}"
    )
    assert get_resp.status_code == 404

    import_resp = client.post(
        f"/entities/{restaurant_a.id}/banking/accounts/{bank.id}/statements",
        files={"file": ("sample.csv", SAMPLE_CSV.read_bytes(), "text/csv")},
    )
    assert import_resp.status_code == 201


def test_api_discard_blocked_when_posted(
    client: TestClient, db_session, restaurant_a, seeded_accounts
) -> None:
    bank = _bank_account(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    supplier_id = _supplier_and_payable(db_session, restaurant_a, accounts)
    statement = _import_sample(db_session, restaurant_a.id, bank.id)

    classify_resp = client.patch(
        f"/entities/{restaurant_a.id}/banking/statements/{statement.id}/lines/{statement.lines[0].id}/classify",
        json={
            "classification": "supplier_payment",
            "supplier_id": str(supplier_id),
            "actor_id": str(ACTOR_ID),
        },
    )
    assert classify_resp.status_code == 200

    discard_resp = client.delete(
        f"/entities/{restaurant_a.id}/banking/statements/{statement.id}"
    )
    assert discard_resp.status_code == 409
    assert "Cannot discard" in discard_resp.json()["detail"]
