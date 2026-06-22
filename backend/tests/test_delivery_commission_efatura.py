"""Delivery commission e-Fatura lifecycle (Phase 6 Slice 3)."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    DELIVERY_COMMISSION_EXPENSE_CODE,
    INPUT_VAT_CODE,
    SALES_REVENUE_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.delivery.commission_posting import post_delivery_commission_draft
from app.core.invoices.posting import DraftPostError
from app.core.ledger.posting import InvalidAccountError
from app.core.ledger.models import JournalEntryLine, JournalEntrySource
from app.core.payables.models import SupplierLedgerEntry
from app.db.session import entity_context
from app.features.banking import service as banking_service
from app.features.delivery.schema import (
    DeliveryReportCreate,
    DeliveryReportPostRequest,
    DeliverySettlementCreate,
)
from app.features.delivery import service as delivery_service
from app.features.invoices.models import InvoiceDraft, InvoiceDraftStatus, InvoiceKind, InvoiceSourceType
from app.features.invoices import service as invoice_service
from app.features.suppliers.models import Supplier
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup, enable_delivery

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"
SAMPLE_XML = FIXTURES / "sample.xml"


def _platform_supplier(db_session, entity_id, *, vkn: str = "9876543210") -> uuid.UUID:
    with entity_context(db_session, entity_id):
        supplier = Supplier(name="Getir Platform", vkn=vkn)
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        return supplier.id


def _posted_report(
    db_session,
    entity_id,
    platform_id: uuid.UUID,
    *,
    gross_kurus: int = 500_000,
    commission_kurus: int = 75_000,
    net_kurus: int = 425_000,
):
    created = delivery_service.create_delivery_report(
        db_session,
        entity_id,
        DeliveryReportCreate(
            delivery_platform_id=platform_id,
            report_date=date(2026, 4, 1),
            gross_kurus=gross_kurus,
            commission_kurus=commission_kurus,
            net_kurus=net_kurus,
            description="Getir April report",
            actor_id=ACTOR_ID,
        ),
    )
    return delivery_service.post_delivery_report_intake(
        db_session,
        entity_id,
        created.id,
        DeliveryReportPostRequest(actor_id=ACTOR_ID),
    )


def _commission_draft(
    db_session,
    entity_id,
    supplier_id: uuid.UUID,
    *,
    net_kurus: int = 62_500,
    gross_kurus: int = 75_000,
    report_id: uuid.UUID | None = None,
    status: InvoiceDraftStatus = InvoiceDraftStatus.DRAFT,
) -> InvoiceDraft:
    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=status,
            invoice_kind=InvoiceKind.DELIVERY_COMMISSION.value
            if report_id
            else InvoiceKind.SUPPLIER.value,
            source_type=InvoiceSourceType.EFATURA_XML,
            file_fingerprint=f"commission-{gross_kurus}-{uuid.uuid4().hex[:8]}",
            supplier_name="Getir Platform",
            supplier_vkn="9876543210",
            supplier_id=supplier_id,
            delivery_report_id=report_id,
            invoice_number=f"GETIR-COM-{gross_kurus}",
            invoice_date=date(2026, 4, 5),
            net_kurus=net_kurus,
            gross_kurus=gross_kurus,
            vat_breakdown=[
                {"rate_percent": 20, "base_kurus": net_kurus, "vat_kurus": gross_kurus - net_kurus},
            ],
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID if status == InvoiceDraftStatus.CONFIRMED else None,
        )
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)
        return draft


@pytest.fixture
def commission_setup(db_session, restaurant_a):
    setup = build_delivery_setup(db_session, restaurant_a.id, platform_names=("Getir",))
    supplier_id = _platform_supplier(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = {a.code: a.id for a in db_session.scalars(select(Account))}
    setup["accounts"] = accounts
    setup["supplier_id"] = supplier_id
    setup["getir"] = setup["platforms"]["Getir"]
    return setup


def test_full_lifecycle_clearing_zero(db_session, commission_setup) -> None:
    entity_id = commission_setup["entity_id"]
    bank = commission_setup["bank"]
    accounts = commission_setup["accounts"]
    supplier_id = commission_setup["supplier_id"]
    getir = commission_setup["getir"]
    clearing_id = getir.gl_account_id
    expense_id = accounts[DELIVERY_COMMISSION_EXPENSE_CODE]
    vat_id = accounts[INPUT_VAT_CODE]
    ap_id = accounts[ACCOUNTS_PAYABLE_CODE]

    report = _posted_report(db_session, entity_id, getir.id)
    delivery_service.create_delivery_settlement(
        db_session,
        entity_id,
        DeliverySettlementCreate(
            delivery_platform_id=getir.id,
            money_account_id=bank.id,
            settlement_date=date(2026, 4, 10),
            amount_kurus=425_000,
            description="Getir payout",
            actor_id=ACTOR_ID,
            delivery_report_id=report.id,
        ),
    )

    draft = _commission_draft(db_session, entity_id, supplier_id)
    linked = invoice_service.link_delivery_report_to_draft(
        db_session, entity_id, draft.id, delivery_report_id=report.id
    )
    assert linked.invoice_kind == InvoiceKind.DELIVERY_COMMISSION
    assert linked.delivery_report_id == report.id

    confirmed = invoice_service.confirm_invoice_draft(
        db_session, entity_id, draft.id, actor_id=ACTOR_ID
    )
    assert confirmed.status == InvoiceDraftStatus.CONFIRMED

    result = post_delivery_commission_draft(
        db_session,
        entity_id,
        draft.id,
        expense_account_id=expense_id,
        actor_id=ACTOR_ID,
    )
    assert result.journal_entry.source == JournalEntrySource.DELIVERY_COMMISSION
    assert result.delivery_report.commission_journal_entry_id == result.journal_entry.id

    with entity_context(db_session, entity_id):
        lines = list(
            db_session.scalars(
                select(JournalEntryLine).where(
                    JournalEntryLine.journal_entry_id == result.journal_entry.id
                )
            )
        )
        ap_lines = [line for line in lines if line.account_id == ap_id]
        assert ap_lines == []

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
        assert debits == credits == 75_000
        assert any(
            line.account_id == expense_id
            and line.amount_kurus == 62_500
            and line.side == AccountNormalBalance.DEBIT
            for line in lines
        )
        assert any(
            line.account_id == vat_id
            and line.amount_kurus == 12_500
            and line.side == AccountNormalBalance.DEBIT
            for line in lines
        )
        assert any(
            line.account_id == clearing_id
            and line.amount_kurus == 75_000
            and line.side == AccountNormalBalance.CREDIT
            for line in lines
        )

        ap_count = db_session.scalar(select(func.count()).select_from(SupplierLedgerEntry))
        assert ap_count == 0

        balance = banking_service.gl_balance_kurus(
            db_session, clearing_id, AccountNormalBalance.DEBIT
        )
    assert balance == 0

    recon = delivery_service.get_delivery_clearing_reconciliation(db_session, entity_id)
    row = next(p for p in recon.platforms if p.delivery_platform_id == getir.id)
    assert row.clearing_balance_kurus == 0
    assert row.in_transit_kurus == 0
    assert row.total_commission_posted_kurus == 75_000
    assert row.commission_posted_count == 1


def test_mismatch_blocks_link_and_post(db_session, commission_setup) -> None:
    entity_id = commission_setup["entity_id"]
    supplier_id = commission_setup["supplier_id"]
    expense_id = commission_setup["accounts"][DELIVERY_COMMISSION_EXPENSE_CODE]
    getir = commission_setup["getir"]

    report = _posted_report(db_session, entity_id, getir.id)
    draft = _commission_draft(
        db_session,
        entity_id,
        supplier_id,
        gross_kurus=80_000,
        net_kurus=66_667,
    )

    linked = invoice_service.link_delivery_report_to_draft(
        db_session, entity_id, draft.id, delivery_report_id=report.id
    )
    assert linked.status == InvoiceDraftStatus.NEEDS_REVIEW.value
    assert linked.review_reason is not None
    draft_id = draft.id

    with pytest.raises(invoice_service.DraftConfirmError):
        invoice_service.confirm_invoice_draft(
            db_session, entity_id, draft_id, actor_id=ACTOR_ID
        )

    with entity_context(db_session, entity_id):
        row = db_session.get(InvoiceDraft, draft_id)
        assert row is not None
        row.status = InvoiceDraftStatus.CONFIRMED
        db_session.commit()

    with pytest.raises(DraftPostError, match="does not match report commission"):
        post_delivery_commission_draft(
            db_session,
            entity_id,
            draft_id,
            expense_account_id=expense_id,
            actor_id=ACTOR_ID,
        )


def test_double_commission_post_blocked(db_session, commission_setup) -> None:
    entity_id = commission_setup["entity_id"]
    supplier_id = commission_setup["supplier_id"]
    expense_id = commission_setup["accounts"][DELIVERY_COMMISSION_EXPENSE_CODE]
    getir = commission_setup["getir"]

    report = _posted_report(db_session, entity_id, getir.id)
    draft = _commission_draft(db_session, entity_id, supplier_id)
    invoice_service.link_delivery_report_to_draft(
        db_session, entity_id, draft.id, delivery_report_id=report.id
    )
    invoice_service.confirm_invoice_draft(
        db_session, entity_id, draft.id, actor_id=ACTOR_ID
    )
    post_delivery_commission_draft(
        db_session,
        entity_id,
        draft.id,
        expense_account_id=expense_id,
        actor_id=ACTOR_ID,
    )

    draft2 = _commission_draft(db_session, entity_id, supplier_id)
    with pytest.raises(invoice_service.DeliveryReportLinkError, match="already posted"):
        invoice_service.link_delivery_report_to_draft(
            db_session, entity_id, draft2.id, delivery_report_id=report.id
        )


def test_cross_entity_isolation(
    client: TestClient, db_session, restaurant_a, restaurant_b, commission_setup
) -> None:
    entity_id = commission_setup["entity_id"]
    supplier_id = commission_setup["supplier_id"]
    expense_id = commission_setup["accounts"][DELIVERY_COMMISSION_EXPENSE_CODE]
    getir = commission_setup["getir"]

    seed_default_chart(db_session, restaurant_b.id)
    enable_delivery(db_session, restaurant_b.id)
    with entity_context(db_session, restaurant_b.id):
        b_accounts = {
            account.code: account.id
            for account in db_session.scalars(select(Account))
        }

    report = _posted_report(db_session, entity_id, getir.id)
    draft = _commission_draft(db_session, entity_id, supplier_id)
    invoice_service.link_delivery_report_to_draft(
        db_session, entity_id, draft.id, delivery_report_id=report.id
    )
    invoice_service.confirm_invoice_draft(
        db_session, entity_id, draft.id, actor_id=ACTOR_ID
    )

    with pytest.raises(LookupError):
        delivery_service.get_delivery_report(db_session, restaurant_b.id, report.id)

    with pytest.raises(InvalidAccountError):
        post_delivery_commission_draft(
            db_session,
            entity_id,
            draft.id,
            expense_account_id=b_accounts[DELIVERY_COMMISSION_EXPENSE_CODE],
            actor_id=ACTOR_ID,
        )

    post_resp = client.post(
        f"/entities/{restaurant_b.id}/invoices/drafts/{draft.id}/post",
        json={
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(b_accounts[DELIVERY_COMMISSION_EXPENSE_CODE]),
        },
    )
    assert post_resp.status_code in (404, 422)


def test_api_commission_e2e(client: TestClient, db_session, commission_setup) -> None:
    entity_id = commission_setup["entity_id"]
    bank = commission_setup["bank"]
    accounts = commission_setup["accounts"]
    getir_id = str(commission_setup["getir"].id)

    client.post(
        f"/entities/{entity_id}/suppliers",
        json={"name": "Getir Platform", "vkn": "9876543210"},
    )

    report_resp = client.post(
        f"/entities/{entity_id}/delivery/reports",
        json={
            "delivery_platform_id": getir_id,
            "report_date": "2026-04-15",
            "gross_kurus": 300_000,
            "commission_kurus": 30_000,
            "net_kurus": 270_000,
            "description": "API commission lifecycle",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert report_resp.status_code == 201
    report_id = report_resp.json()["id"]

    post_report = client.post(
        f"/entities/{entity_id}/delivery/reports/{report_id}/post",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert post_report.status_code == 200

    settle_resp = client.post(
        f"/entities/{entity_id}/delivery/settlements",
        json={
            "delivery_platform_id": getir_id,
            "money_account_id": str(bank.id),
            "settlement_date": "2026-04-20",
            "amount_kurus": 270_000,
            "description": "API payout",
            "actor_id": str(ACTOR_ID),
        },
    )
    assert settle_resp.status_code == 201

    draft = _commission_draft(
        db_session,
        entity_id,
        commission_setup["supplier_id"],
        gross_kurus=30_000,
        net_kurus=25_000,
    )

    link_resp = client.post(
        f"/entities/{entity_id}/invoices/drafts/{draft.id}/link-delivery-report",
        json={"delivery_report_id": str(report_id)},
    )
    assert link_resp.status_code == 200
    assert link_resp.json()["invoice_kind"] == "delivery_commission"

    confirm_resp = client.post(
        f"/entities/{entity_id}/invoices/drafts/{draft.id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert confirm_resp.status_code == 200

    post_resp = client.post(
        f"/entities/{entity_id}/invoices/drafts/{draft.id}/post",
        json={
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(accounts[DELIVERY_COMMISSION_EXPENSE_CODE]),
        },
    )
    assert post_resp.status_code == 200
    body = post_resp.json()
    assert body["journal_entry_source"] == "delivery_commission"
    assert body["delivery_report_id"] == report_id
    assert body["supplier_ledger_entry_id"] is None
    assert body["payable_balance_kurus"] is None

    recon_resp = client.get(f"/entities/{entity_id}/delivery/clearing-reconciliation")
    assert recon_resp.status_code == 200
    getir = next(
        p
        for p in recon_resp.json()["platforms"]
        if p["delivery_platform_id"] == getir_id
    )
    assert getir["clearing_balance_kurus"] == 0
    assert getir["in_transit_kurus"] == 0


def test_supplier_invoice_path_unchanged(
    client: TestClient, db_session, restaurant_a, commission_setup
) -> None:
    accounts = commission_setup["accounts"]
    getir_clearing = commission_setup["getir"].gl_account_id
    content = SAMPLE_XML.read_bytes()

    client.post(
        f"/entities/{restaurant_a.id}/suppliers",
        json={"name": "Metro Gida", "vkn": "1234567890"},
    )
    upload = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )
    assert upload.status_code == 201
    assert upload.json()["invoice_kind"] == "supplier"
    draft_id = upload.json()["id"]

    confirm = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/confirm",
        json={"actor_id": str(ACTOR_ID)},
    )
    assert confirm.status_code == 200

    post = client.post(
        f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}/post",
        json={
            "actor_id": str(ACTOR_ID),
            "expense_account_id": str(accounts["5200"]),
        },
    )
    assert post.status_code == 200
    assert post.json()["journal_entry_source"] == "invoice"
    assert post.json()["supplier_ledger_entry_id"] is not None
    assert post.json()["payable_balance_kurus"] == 12_000_000

    with entity_context(db_session, restaurant_a.id):
        revenue_id = accounts[SALES_REVENUE_CODE]
        ap_id = accounts[ACCOUNTS_PAYABLE_CODE]
        lines = list(
            db_session.scalars(
                select(JournalEntryLine).where(
                    JournalEntryLine.journal_entry_id == post.json()["journal_entry_id"]
                )
            )
        )
        assert any(line.account_id == ap_id for line in lines)
        assert not any(line.account_id == getir_clearing for line in lines)
        assert not any(line.account_id == revenue_id for line in lines)
