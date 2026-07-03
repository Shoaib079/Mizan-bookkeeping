"""Supplier credit note (iade) — extraction, posting, KDV, uniqueness."""

from __future__ import annotations

import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters.ocr_ai.efatura import extract_efatura_pdf
from app.core.chart_of_accounts.default_chart import (
    ACCOUNTS_PAYABLE_CODE,
    INPUT_VAT_CODE,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.chart_of_accounts.types import AccountNormalBalance
from app.core.invoices.posting import (
    DraftPostError,
    build_supplier_credit_posting_lines,
    post_confirmed_draft,
    post_supplier_credit_draft_to_ledger,
)
from app.core.payables.models import SupplierLedgerEntry
from app.core.payables.types import SupplierMovementType
from app.db.session import entity_context
from app.features.invoices.models import (
    InvoiceDraft,
    InvoiceDraftStatus,
    InvoiceKind,
    InvoiceSourceType,
)
from app.features.invoices import service as invoice_service
from app.features.payables import supplier_activity
from app.features.reports import kdv_input
from app.features.suppliers.models import Supplier

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"
METRO_IADE_PDF = FIXTURES / "metro-fritoz-iade.pdf"

ACTOR_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")

METRO_VKN = "6200031354"
BUYER_VKN = "7342656849"
IADE_NUMBER = "GIB2026000000004"
IADE_DATE = date(2026, 6, 18)
REF_NUMBER = "OUP2025000013559"
REF_DATE = date(2025, 12, 1)
NET_KURUS = 457_500
GROSS_KURUS = 549_000
VAT_BREAKDOWN = [{"rate_percent": 20.0, "base_kurus": NET_KURUS, "vat_kurus": 91_500}]


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _metro_supplier(db_session, entity) -> uuid.UUID:
    with entity_context(db_session, entity.id):
        supplier = Supplier(name="Metro Gida", vkn=METRO_VKN)
        db_session.add(supplier)
        db_session.commit()
        db_session.refresh(supplier)
        return supplier.id


def _original_invoice_draft(
    db_session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    invoice_number: str = REF_NUMBER,
    invoice_date: date = REF_DATE,
    gross_kurus: int = GROSS_KURUS,
) -> InvoiceDraft:
    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=InvoiceDraftStatus.CONFIRMED,
            invoice_kind=InvoiceKind.SUPPLIER.value,
            source_type=InvoiceSourceType.EFATURA_PDF,
            file_fingerprint=f"orig-{invoice_number}",
            supplier_id=supplier_id,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            net_kurus=NET_KURUS,
            gross_kurus=gross_kurus,
            vat_breakdown=VAT_BREAKDOWN,
            currency="TRY",
            extraction_payload={},
            confirmed_by=ACTOR_ID,
        )
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)
        return draft


def _credit_draft(
    db_session,
    entity_id: uuid.UUID,
    supplier_id: uuid.UUID,
    *,
    invoice_number: str = IADE_NUMBER,
    status: InvoiceDraftStatus = InvoiceDraftStatus.CONFIRMED,
    file_fingerprint: str | None = None,
) -> InvoiceDraft:
    with entity_context(db_session, entity_id):
        draft = InvoiceDraft(
            status=status,
            invoice_kind=InvoiceKind.SUPPLIER_CREDIT.value,
            source_type=InvoiceSourceType.EFATURA_PDF,
            file_fingerprint=file_fingerprint or f"iade-{invoice_number}-{uuid.uuid4()}",
            supplier_id=supplier_id,
            invoice_number=invoice_number,
            referenced_invoice_number=REF_NUMBER,
            referenced_invoice_date=REF_DATE,
            invoice_date=IADE_DATE,
            net_kurus=NET_KURUS,
            gross_kurus=GROSS_KURUS,
            vat_breakdown=VAT_BREAKDOWN,
            currency="TRY",
            extraction_payload={"invoice_type_code": "IADE"},
            confirmed_by=ACTOR_ID if status == InvoiceDraftStatus.CONFIRMED else None,
        )
        db_session.add(draft)
        db_session.commit()
        db_session.refresh(draft)
        return draft


def test_pdf_extraction_parses_iade_and_referenced_invoice() -> None:
    content = METRO_IADE_PDF.read_bytes()
    extraction = extract_efatura_pdf(content, buyer_vkn=BUYER_VKN)

    assert extraction.invoice_type_code == "IADE"
    assert extraction.invoice_number == IADE_NUMBER
    assert extraction.invoice_date == IADE_DATE
    assert extraction.supplier_vkn == METRO_VKN
    assert extraction.referenced_invoice_number == REF_NUMBER
    assert extraction.referenced_invoice_date == REF_DATE
    assert extraction.net_kurus == NET_KURUS
    assert extraction.gross_kurus == GROSS_KURUS


def test_partial_iade_posting_creates_negated_gl_lines(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _metro_supplier(db_session, restaurant_a)
    expense_id = seeded_accounts["5200"]
    ap_id = seeded_accounts[ACCOUNTS_PAYABLE_CODE]
    vat_id = seeded_accounts[INPUT_VAT_CODE]

    lines = build_supplier_credit_posting_lines(
        expense_account_id=expense_id,
        ap_account_id=ap_id,
        input_vat_account_id=vat_id,
        net_kurus=NET_KURUS,
        gross_kurus=GROSS_KURUS,
        vat_breakdown=VAT_BREAKDOWN,
    )

    by_account = {line.account_id: line for line in lines}
    assert by_account[expense_id].side == AccountNormalBalance.CREDIT
    assert by_account[expense_id].amount_kurus == NET_KURUS
    assert by_account[vat_id].side == AccountNormalBalance.CREDIT
    assert by_account[vat_id].amount_kurus == 91_500
    assert by_account[ap_id].side == AccountNormalBalance.DEBIT
    assert by_account[ap_id].amount_kurus == GROSS_KURUS


def test_supplier_ledger_credit_note_negative_amount(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _metro_supplier(db_session, restaurant_a)
    original = _original_invoice_draft(db_session, restaurant_a.id, supplier_id)
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        original.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    credit = _credit_draft(db_session, restaurant_a.id, supplier_id)
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        credit.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_a.id):
        entry = db_session.scalar(
            select(SupplierLedgerEntry).where(
                SupplierLedgerEntry.movement_type
                == SupplierMovementType.CREDIT_NOTE.value
            )
        )
        assert entry is not None
        assert entry.amount_kurus == -GROSS_KURUS


def test_kdv_report_includes_negative_credit_line(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _metro_supplier(db_session, restaurant_a)
    original = _original_invoice_draft(db_session, restaurant_a.id, supplier_id)
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        original.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )
    credit = _credit_draft(db_session, restaurant_a.id, supplier_id)
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        credit.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    report = kdv_input.get_kdv_input_report(
        db_session,
        restaurant_a.id,
        date(2025, 1, 1),
        date(2026, 12, 31),
    )

    assert report.total_base_kurus == 0
    assert report.total_vat_kurus == 0
    assert report.invoice_count == 2
    rate_20 = next(row for row in report.rates if row.rate_percent == 20.0)
    assert rate_20.base_kurus == 0
    assert rate_20.vat_kurus == 0


def test_duplicate_iade_number_blocked(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _metro_supplier(db_session, restaurant_a)
    first = _credit_draft(db_session, restaurant_a.id, supplier_id)
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        first.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    second = _credit_draft(
        db_session,
        restaurant_a.id,
        supplier_id,
        invoice_number=IADE_NUMBER,
    )
    with entity_context(db_session, restaurant_a.id):
        draft = db_session.get(InvoiceDraft, second.id)
        assert draft is not None
        with pytest.raises(DraftPostError, match="posted credit note"):
            post_supplier_credit_draft_to_ledger(
                db_session,
                restaurant_a.id,
                draft,
                expense_account_id=seeded_accounts["5200"],
                actor_id=ACTOR_ID,
            )


def test_full_iade_credit_equals_original_invoice_gross(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _metro_supplier(db_session, restaurant_a)
    original = _original_invoice_draft(db_session, restaurant_a.id, supplier_id)
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        original.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    credit = _credit_draft(db_session, restaurant_a.id, supplier_id)
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        credit.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    with entity_context(db_session, restaurant_a.id):
        entries = list(
            db_session.scalars(
                select(SupplierLedgerEntry).where(
                    SupplierLedgerEntry.supplier_id == supplier_id
                )
            )
        )
        assert sum(e.amount_kurus for e in entries) == 0


def test_intake_from_pdf_sets_supplier_credit_kind(
    db_session, restaurant_a, seeded_accounts
) -> None:
    restaurant_a.vkn = BUYER_VKN
    db_session.commit()
    db_session.refresh(restaurant_a)

    with entity_context(db_session, restaurant_a.id):
        supplier = Supplier(name="Metro Gida", vkn=METRO_VKN)
        db_session.add(supplier)
        db_session.commit()

    content = METRO_IADE_PDF.read_bytes()
    out = invoice_service.create_efatura_draft_from_upload(
        db_session, restaurant_a.id, content, filename="metro-iade.pdf"
    )

    assert out.invoice_kind == InvoiceKind.SUPPLIER_CREDIT
    assert out.referenced_invoice_number == REF_NUMBER
    assert out.referenced_invoice_date == REF_DATE


def test_supplier_activity_shows_credit_note_as_iade(
    db_session, restaurant_a, seeded_accounts
) -> None:
    supplier_id = _metro_supplier(db_session, restaurant_a)
    original = _original_invoice_draft(db_session, restaurant_a.id, supplier_id)
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        original.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )
    credit = _credit_draft(db_session, restaurant_a.id, supplier_id)
    post_confirmed_draft(
        db_session,
        restaurant_a.id,
        credit.id,
        expense_account_id=seeded_accounts["5200"],
        actor_id=ACTOR_ID,
    )

    activity = supplier_activity.get_supplier_activity(
        db_session,
        restaurant_a.id,
        supplier_id,
        from_date=date(2025, 1, 1),
        to_date=date(2026, 12, 31),
    )

    credit_rows = [
        r for r in activity.rows if r.movement_kind == SupplierMovementType.CREDIT_NOTE.value
    ]
    assert len(credit_rows) == 1
    assert credit_rows[0].movement_label == "İade"
    assert credit_rows[0].amount_kurus == -GROSS_KURUS
