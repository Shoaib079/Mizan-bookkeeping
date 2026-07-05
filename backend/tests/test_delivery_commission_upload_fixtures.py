"""End-to-end upload → platform link → confirm → post for commission PDF fixtures."""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import select

from app.core.delivery.commission_posting import post_delivery_commission_draft
from app.db.session import entity_context
from app.features.delivery import service as delivery_service
from app.features.invoices.models import InvoiceDraftStatus, InvoiceKind
from app.features.invoices import service as invoice_service
from tests.delivery_helpers import ACTOR_ID, delivery_setup as build_delivery_setup

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura" / "regression"

UPLOAD_CASES = (
    pytest.param(
        "58.pdf",
        "Getir",
        "3940482658",
        id="getir-commission-58",
    ),
    pytest.param(
        "54.pdf",
        "Yemeksepeti",
        "9470457468",
        id="yemeksepeti-commission-54",
    ),
)


@pytest.fixture
def delivery_entity(db_session, restaurant_a):
    return build_delivery_setup(db_session, restaurant_a.id)


@pytest.mark.parametrize("filename,platform_name,expected_vkn", UPLOAD_CASES)
@pytest.mark.skipif(
    not (FIXTURES / "58.pdf").exists() or not (FIXTURES / "54.pdf").exists(),
    reason="commission regression PDFs not available",
)
def test_commission_fixture_upload_links_platform_and_posts(
    db_session,
    delivery_entity,
    filename: str,
    platform_name: str,
    expected_vkn: str,
) -> None:
    entity_id = delivery_entity["entity_id"]
    platform_id = delivery_entity["platforms"][platform_name].id
    pdf_bytes = (FIXTURES / filename).read_bytes()

    draft = invoice_service.create_efatura_draft_from_upload(
        db_session,
        entity_id,
        pdf_bytes,
        filename=filename,
    )

    assert draft.invoice_kind == InvoiceKind.DELIVERY_COMMISSION
    assert draft.supplier_vkn == expected_vkn
    assert draft.delivery_platform_id == platform_id, (
        "Commission upload must auto-link the entity delivery platform by VKN/name"
    )

    invoice_service.confirm_invoice_draft(
        db_session,
        entity_id,
        draft.id,
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, entity_id):
        from app.features.invoices.supplier_expense_learning import (
            suggest_commission_expense_account,
        )

        expense = suggest_commission_expense_account(db_session)
        assert expense is not None
        result = post_delivery_commission_draft(
            db_session,
            entity_id,
            draft.id,
            expense_account_id=expense.account_id,
            actor_id=ACTOR_ID,
        )

    posted = invoice_service.get_invoice_draft(db_session, entity_id, draft.id)
    assert posted.status == InvoiceDraftStatus.POSTED
    assert result.delivery_platform_id == platform_id

    recon = delivery_service.get_delivery_clearing_reconciliation(db_session, entity_id)
    row = next(p for p in recon.platforms if p.delivery_platform_id == platform_id)
    assert row.commission_posted_count >= 1
    assert row.total_commission_posted_kurus >= draft.gross_kurus


@pytest.mark.parametrize("filename,platform_name,expected_vkn", UPLOAD_CASES)
@pytest.mark.skipif(
    not (FIXTURES / "58.pdf").exists() or not (FIXTURES / "54.pdf").exists(),
    reason="commission regression PDFs not available",
)
def test_commission_fixture_matches_platform_by_vkn_with_custom_name(
    db_session,
    restaurant_a,
    filename: str,
    platform_name: str,
    expected_vkn: str,
) -> None:
    """Platform display names like 'Getir Yemek' must still match by known VKN."""
    custom_names = {
        "Getir": "Getir Yemek",
        "Yemeksepeti": "Yemek Sepeti",
    }
    setup = build_delivery_setup(
        db_session,
        restaurant_a.id,
        platform_names=(custom_names[platform_name],),
    )
    entity_id = setup["entity_id"]
    platform_id = setup["platforms"][custom_names[platform_name]].id
    pdf_bytes = (FIXTURES / filename).read_bytes()

    draft = invoice_service.create_efatura_draft_from_upload(
        db_session,
        entity_id,
        pdf_bytes,
        filename=filename,
    )

    assert draft.invoice_kind == InvoiceKind.DELIVERY_COMMISSION
    assert draft.supplier_vkn == expected_vkn
    assert draft.delivery_platform_id == platform_id


def test_link_platform_upgrades_getir_supplier_draft_to_commission(
    db_session, delivery_entity
) -> None:
    """Ambiguous Getir intake (supplier kind) becomes commission when platform linked."""
    entity_id = delivery_entity["entity_id"]
    platform_id = delivery_entity["platforms"]["Getir"].id

    with entity_context(db_session, entity_id):
        from app.features.invoices.models import InvoiceDraft, InvoiceSourceType

        draft = InvoiceDraft(
            entity_id=entity_id,
            status=InvoiceDraftStatus.NEEDS_REVIEW.value,
            invoice_kind=InvoiceKind.SUPPLIER.value,
            source_type=InvoiceSourceType.EFATURA_PDF.value,
            file_fingerprint="getir-ambiguous-link-test",
            supplier_name="Getir Perakende",
            supplier_vkn="3940482658",
            invoice_number="AMB-1",
            invoice_date=__import__("datetime").date(2026, 5, 1),
            net_kurus=1000,
            gross_kurus=1200,
            vat_breakdown=[{"rate_percent": 20, "base_kurus": 1000, "vat_kurus": 200}],
            currency="TRY",
            review_reason="Getir invoice — confirm supplier expense vs delivery commission",
        )
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)

    linked = invoice_service.link_delivery_platform_to_draft(
        db_session,
        entity_id,
        draft.id,
        delivery_platform_id=platform_id,
    )
    assert linked.invoice_kind == InvoiceKind.DELIVERY_COMMISSION
    assert linked.delivery_platform_id == platform_id
    assert linked.review_reason is None
