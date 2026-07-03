"""Invoice auto-post on upload — opt-in entity setting."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.invoices.posting import post_confirmed_draft
from app.core.ledger.models import JournalEntry, JournalEntrySource
from app.db.session import entity_context
from app.features.entities import service as entity_service
from app.features.entities.schema import EntitySettingCreate
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceSourceType
from app.features.invoices.settings import INVOICE_SUPPLIER_AUTO_POST_KEY
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


def _enable_auto_post(db_session, entity_id) -> None:
    entity_service.create_entity_setting(
        db_session,
        entity_id,
        EntitySettingCreate(key=INVOICE_SUPPLIER_AUTO_POST_KEY, value="true"),
    )


def _seed_expense_learning(
    db_session,
    entity,
    supplier_id,
    supplies_id,
) -> None:
    for index in range(3):
        with entity_context(db_session, entity.id):
            draft = InvoiceDraft(
                status=InvoiceDraftStatus.CONFIRMED,
                source_type=InvoiceSourceType.EFATURA_XML,
                file_fingerprint=f"auto-seed-{index}",
                supplier_id=supplier_id,
                invoice_number=f"AUTO-{index}",
                invoice_date=date(2026, 3, 15),
                net_kurus=1_000_000,
                gross_kurus=1_200_000,
                vat_breakdown=[
                    {"rate_percent": 20, "base_kurus": 1_000_000, "vat_kurus": 200_000},
                ],
                currency="TRY",
                extraction_payload={"classification_confidence": "high"},
                confirmed_by=ACTOR_ID,
            )
            db_session.add(draft)
            db_session.commit()
            db_session.refresh(draft)
        post_confirmed_draft(
            db_session,
            entity.id,
            draft.id,
            expense_account_id=supplies_id,
            actor_id=ACTOR_ID,
        )


def test_auto_post_disabled_leaves_draft(client, restaurant_a, seeded_accounts) -> None:
    content = SAMPLE_XML.read_bytes()
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["posted_by_rule_auto"] is False


def test_auto_post_when_enabled_and_trusted(
    client, db_session, restaurant_a, seeded_accounts
) -> None:
    _enable_auto_post(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        supplier = Supplier(name="Metro Gida", vkn="1234567890")
        db_session.add(supplier)
        db_session.commit()
        supplier_id = supplier.id

    _seed_expense_learning(
        db_session,
        restaurant_a,
        supplier_id,
        seeded_accounts["5220"],
    )

    content = SAMPLE_XML.read_bytes()
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "posted"
    assert body["posted_by_rule_auto"] is True
    assert body["journal_entry_id"] is not None

    with entity_context(db_session, restaurant_a.id):
        journal = db_session.get(JournalEntry, uuid.UUID(body["journal_entry_id"]))
        assert journal is not None
        assert journal.source == JournalEntrySource.RULE_AUTO


def test_auto_post_skipped_without_high_expense_learning(
    client, db_session, restaurant_a, seeded_accounts
) -> None:
    _enable_auto_post(db_session, restaurant_a.id)
    content = SAMPLE_XML.read_bytes()
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["posted_by_rule_auto"] is False
