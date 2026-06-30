"""Invoice draft → GL + payables posting (Phase 2 draft-to-ledger slice)."""

from __future__ import annotations

import uuid
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    INPUT_VAT_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.invoices.posting import DraftPostError, build_invoice_posting_lines, post_confirmed_draft
from app.core.ledger.models import JournalEntry, JournalEntryLine, JournalEntrySource
from app.core.ledger.posting import InvalidAccountError
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context
from datetime import date

from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceSourceType
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


def _supplier(db_session, entity) -> uuid.UUID:
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


def _upload(client, entity_id, *, content=None):
    content = content or SAMPLE_XML.read_bytes()
    return client.post(
        f"/entities/{entity_id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )


def _linked_confirmed(client, entity_id):
    client.post(
        f"/entities/{entity_id}/suppliers",
        json={"name": "Metro Gida", "vkn": "1234567890"},
    )
    upload = _upload(client, entity_id)
    assert upload.status_code == 201
    draft_id = upload.json()["id"]
    confirm = client.post(
        f"/entities/{entity_id}/invoices/drafts/{draft_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert confirm.status_code == 200
    return draft_id


def test_post_confirmed_draft_happy_path(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    draft = _confirmed_draft(db_session, restaurant_a, supplier_id)
    expense_id = seeded_accounts["5200"]

    result = post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=expense_id,
        actor_id=ACTOR_ID,
    )

    assert result.journal_entry.source == JournalEntrySource.INVOICE
    assert result.supplier_ledger_entry.movement_type == SupplierMovementType.INVOICE
    assert result.supplier_ledger_entry.amount_kurus == 12_000_000
    assert result.supplier_ledger_entry.journal_entry_id == result.journal_entry.id
    assert result.payable_balance_kurus == 12_000_000

    with entity_context(db_session, restaurant_a.id):
        refreshed = db_session.get(InvoiceDraft, draft.id)
        assert refreshed is not None
        assert refreshed.status == InvoiceDraftStatus.POSTED
        assert refreshed.journal_entry_id == result.journal_entry.id

        lines = list(
            db_session.scalars(
                select(JournalEntryLine).where(
                    JournalEntryLine.journal_entry_id == result.journal_entry.id
                )
            )
        )
        ap_id = seeded_accounts[ACCOUNTS_PAYABLE_CODE]
        vat_id = seeded_accounts[INPUT_VAT_CODE]
        debits = sum(
            line.amount_kurus
            for line in lines
            if line.side == AccountNormalBalance.DEBIT
        )
        credits = sum(
            line.amount_kurus
            for line in lines
            if line.side == AccountNormalBalance.CREDIT
        )
        assert debits == credits == 12_000_000
        assert any(
            line.account_id == expense_id
            and line.amount_kurus == 10_000_000
            and line.side == AccountNormalBalance.DEBIT
            for line in lines
        )
        assert any(
            line.account_id == vat_id
            and line.amount_kurus == 2_000_000
            and line.side == AccountNormalBalance.DEBIT
            for line in lines
        )
        assert any(
            line.account_id == ap_id
            and line.amount_kurus == 12_000_000
            and line.side == AccountNormalBalance.CREDIT
            for line in lines
        )


def test_reject_unconfirmed_draft(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    draft = _confirmed_draft(db_session, restaurant_a, supplier_id)
    draft_id = draft.id
    with entity_context(db_session, restaurant_a.id):
        row = db_session.get(InvoiceDraft, draft_id)
        assert row is not None
        row.status = InvoiceDraftStatus.DRAFT
        db_session.commit()

    with pytest.raises(DraftPostError, match="confirmed"):
        post_confirmed_draft(
            db_session,
            restaurant_a.id,
            draft_id,
            expense_account_id=seeded_accounts["5200"],
            actor_id=ACTOR_ID,
        )


def test_reject_unlinked_supplier(
    db_session, restaurant_a, seeded_accounts
) -> None:
    content = SAMPLE_XML.read_bytes()
    invoice_service.create_efatura_draft_from_upload(db_session, restaurant_a.id, content)
    with entity_context(db_session, restaurant_a.id):
        draft = db_session.scalar(select(InvoiceDraft))
        assert draft is not None
        draft.status = InvoiceDraftStatus.CONFIRMED
        draft.supplier_id = None
        db_session.commit()

        with pytest.raises(DraftPostError, match="Supplier must be linked"):
            post_confirmed_draft(
                db_session,
                restaurant_a.id,
                draft.id,
                expense_account_id=seeded_accounts["5200"],
                actor_id=ACTOR_ID,
            )


def test_reject_already_posted(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    draft = _confirmed_draft(db_session, restaurant_a, supplier_id)
    expense_id = seeded_accounts["5200"]
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=expense_id,
        actor_id=ACTOR_ID,
    )

    with pytest.raises(DraftPostError, match="already posted"):
        post_confirmed_draft(
            db_session,
            restaurant_a.id,
            draft.id,
            expense_account_id=expense_id,
            actor_id=ACTOR_ID,
        )


def test_reject_wrong_expense_account_type(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    draft = _confirmed_draft(db_session, restaurant_a, supplier_id)

    with pytest.raises(InvalidAccountError, match="not an expense"):
        post_confirmed_draft(
            db_session,
            restaurant_a.id,
            draft.id,
            expense_account_id=seeded_accounts[ACCOUNTS_PAYABLE_CODE],
            actor_id=ACTOR_ID,
        )


def test_per_rate_vat_lines(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    with entity_context(db_session, restaurant_a.id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint="multi-vat-fp",
            supplier_id=supplier_id,
            invoice_number="MULTI-VAT-1",
            invoice_date=date(2026, 3, 15),
            net_kurus=15_000_000,
            gross_kurus=17_500_000,
            vat_breakdown=[
                {"rate_percent": 10, "base_kurus": 10_000_000, "vat_kurus": 1_000_000},
                {"rate_percent": 20, "base_kurus": 5_000_000, "vat_kurus": 1_500_000},
            ],
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID,
        )
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)

    result = post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    vat_id = seeded_accounts[INPUT_VAT_CODE]
    with entity_context(db_session, restaurant_a.id):
        vat_lines = list(
            db_session.scalars(
                select(JournalEntryLine).where(
                    JournalEntryLine.journal_entry_id == result.journal_entry.id,
                    JournalEntryLine.account_id == vat_id,
                )
            )
        )
    assert len(vat_lines) == 2
    assert sorted(line.amount_kurus for line in vat_lines) == [1_000_000, 1_500_000]


def test_build_invoice_posting_lines_negative_vat_balances(seeded_accounts) -> None:
    """Mixed-rate grocery invoice with discount VAT (Getir-style) must balance."""
    gross_kurus = 146_022
    vat_breakdown = [
        {"rate_percent": 10, "base_kurus": 100_000, "vat_kurus": 36_693},
        {"rate_percent": 1, "base_kurus": 10_000, "vat_kurus": -2_471},
    ]
    net_kurus = gross_kurus - sum(line["vat_kurus"] for line in vat_breakdown)

    lines = build_invoice_posting_lines(
        expense_account_id=seeded_accounts["5200"],
        ap_account_id=seeded_accounts[ACCOUNTS_PAYABLE_CODE],
        input_vat_account_id=seeded_accounts[INPUT_VAT_CODE],
        net_kurus=net_kurus,
        gross_kurus=gross_kurus,
        vat_breakdown=vat_breakdown,
    )

    debits = sum(
        line.amount_kurus
        for line in lines
        if line.side == AccountNormalBalance.DEBIT
    )
    credits = sum(
        line.amount_kurus
        for line in lines
        if line.side == AccountNormalBalance.CREDIT
    )
    assert debits == credits
    ap_credits = [
        line
        for line in lines
        if line.account_id == seeded_accounts[ACCOUNTS_PAYABLE_CODE]
    ]
    assert len(ap_credits) == 1
    assert ap_credits[0].amount_kurus == gross_kurus
    vat_credits = [
        line
        for line in lines
        if line.account_id == seeded_accounts[INPUT_VAT_CODE]
        and line.side == AccountNormalBalance.CREDIT
    ]
    assert len(vat_credits) == 1
    assert vat_credits[0].amount_kurus == 2_471


def test_post_invoice_with_negative_vat_line(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _supplier(db_session, restaurant_a)
    gross_kurus = 146_022
    vat_breakdown = [
        {"rate_percent": 10, "base_kurus": 100_000, "vat_kurus": 36_693},
        {"rate_percent": 1, "base_kurus": 10_000, "vat_kurus": -2_471},
    ]
    net_kurus = gross_kurus - sum(line["vat_kurus"] for line in vat_breakdown)

    with entity_context(db_session, restaurant_a.id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            source_type=InvoiceSourceType.EFATURA_PDF,
            file_fingerprint="getir-mixed-vat-discount",
            supplier_id=supplier_id,
            invoice_number="Z012026000264846",
            invoice_date=date(2026, 5, 2),
            net_kurus=net_kurus,
            gross_kurus=gross_kurus,
            vat_breakdown=vat_breakdown,
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID,
        )
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)

    result = post_confirmed_draft(
        db_session,
        restaurant_a.id,
        draft.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )
    assert result.journal_entry.source == JournalEntrySource.INVOICE
    assert result.supplier_ledger_entry.amount_kurus == gross_kurus


def test_cross_entity_isolation(
    db_session, restaurant_a, restaurant_b, seeded_accounts
) -> None:
    seed_default_chart(db_session, restaurant_b.id)
    with entity_context(db_session, restaurant_b.id):
        b_accounts = {
            account.code: account.id
            for account in db_session.scalars(select(Account))
        }

    supplier_id = _supplier(db_session, restaurant_a)
    draft = _confirmed_draft(db_session, restaurant_a, supplier_id)

    with pytest.raises(InvalidAccountError):
        post_confirmed_draft(
            db_session,
            restaurant_a.id,
            draft.id,
            expense_account_id=b_accounts["5200"],
            actor_id=ACTOR_ID,
        )


def test_api_post_end_to_end(
    client, restaurant_a, seeded_accounts
) -> None:
    draft_id = _linked_confirmed(client, restaurant_a.id)

    post = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/post",
        json={
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(seeded_accounts["5200"]),
        },
    )
    assert post.status_code == 200
    body = post.json()
    assert body["draft"]["status"] == "posted"
    assert body["journal_entry_source"] == "invoice"
    assert body["payable_balance_kurus"] == 12_000_000
    assert body["journal_entry_id"]
    assert body["supplier_ledger_entry_id"]

    again = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/post",
        json={
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(seeded_accounts["5200"]),
        },
    )
    assert again.status_code == 422


def test_api_post_unconfirmed_returns_422(
    client, restaurant_a, seeded_accounts
) -> None:
    client.post(f"/entities/{restaurant_a.id}/suppliers", json={"name": "Metro Gida", "vkn": "1234567890"})
    upload = _upload(client, restaurant_a.id)
    draft_id = upload.json()["id"]

    post = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/post",
        json={
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(seeded_accounts["5200"]),
        },
    )
    assert post.status_code == 422


def test_api_post_period_locked_returns_422(
    client, restaurant_a, seeded_accounts, db_session
) -> None:
    from app.core.auth.types import EntityRole
    from app.core.period_locks.models import PeriodLockKind
    from app.core.period_locks.service import close_period
    from app.features.auth import service as auth_service
    from app.features.auth.schema import MembershipCreate, UserCreate

    owner = auth_service.create_user(
        db_session, UserCreate(email="owner-post-lock@test.com", display_name="Owner")
    )
    auth_service.add_entity_member(
        db_session,
        restaurant_a.id,
        MembershipCreate(user_id=owner.id, role=EntityRole.OWNER),
    )

    draft_id = _linked_confirmed(client, restaurant_a.id)
    draft = client.get(f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}")
    assert draft.status_code == 200
    invoice_date = date.fromisoformat(draft.json()["invoice_date"])

    close_period(
        db_session,
        restaurant_a.id,
        lock_kind=PeriodLockKind.DAY,
        anchor_date=invoice_date,
        actor_id=owner.id,
        reason="Month-end close",
    )

    post = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/post",
        json={
            "actor_id": str(owner.id),
            "expense_account_id": str(seeded_accounts["5200"]),
        },
    )
    assert post.status_code == 422
    assert "closed period" in post.json()["detail"].lower()
