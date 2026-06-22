"""e-Fatura upload → invoice draft (Decisions §7, §8) — read into draft only."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

from app.adapters.ocr_ai.efatura import (
    extract_efatura_xml,
    register_pdf_fixture,
)
from app.db.session import entity_context
from app.features.invoices.models import InvoiceDraft
from app.features.invoices.validation import InvoiceTotalsError, validate_invoice_totals

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "efatura"
SAMPLE_XML = FIXTURES / "sample.xml"


def test_extract_sample_xml_fixture_fields() -> None:
    content = SAMPLE_XML.read_bytes()
    extraction = extract_efatura_xml(content)

    assert extraction.invoice_number == "EF2026000123"
    assert extraction.invoice_date == date(2026, 3, 15)
    assert extraction.supplier_name == "Metro Gida Ticaret A.S."
    assert extraction.supplier_vkn == "1234567890"
    assert extraction.net_kurus == 10_000_000
    assert extraction.gross_kurus == 12_000_000
    assert extraction.currency == "TRY"
    assert len(extraction.vat_breakdown) == 1
    assert extraction.vat_breakdown[0]["rate_percent"] == 20.0
    assert extraction.vat_breakdown[0]["base_kurus"] == 10_000_000
    assert extraction.vat_breakdown[0]["vat_kurus"] == 2_000_000


def test_validate_invoice_totals_rejects_bad_math() -> None:
    breakdown = [{"rate_percent": 20, "base_kurus": 100_000, "vat_kurus": 20_000}]
    with pytest.raises(InvoiceTotalsError):
        validate_invoice_totals(100_000, 150_000, breakdown)


def test_extract_xml_rejects_bad_totals() -> None:
    content = SAMPLE_XML.read_bytes().replace(
        b"<cbc:TaxInclusiveAmount currencyID=\"TRY\">120000.00</cbc:TaxInclusiveAmount>",
        b"<cbc:TaxInclusiveAmount currencyID=\"TRY\">130000.00</cbc:TaxInclusiveAmount>",
    )
    with pytest.raises(InvoiceTotalsError):
        extract_efatura_xml(content)


def test_upload_xml_creates_draft(client, restaurant_a) -> None:
    content = SAMPLE_XML.read_bytes()

    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["source_type"] == "efatura_xml"
    assert body["invoice_number"] == "EF2026000123"
    assert body["net_kurus"] == 10_000_000
    assert body["gross_kurus"] == 12_000_000
    assert body["vat_breakdown"][0]["vat_kurus"] == 2_000_000
    assert body["file_fingerprint"]
    assert "stored_path" in body["extraction_payload"]


def test_duplicate_upload_returns_409(client, restaurant_a) -> None:
    content = SAMPLE_XML.read_bytes()
    url = f"/entities/{restaurant_a.id}/invoices/efatura/draft"

    first = client.post(url, files={"file": ("sample.xml", content, "application/xml")})
    assert first.status_code == 201
    existing_id = first.json()["id"]

    second = client.post(url, files={"file": ("sample.xml", content, "application/xml")})
    assert second.status_code == 409
    assert second.json()["detail"]["existing_draft_id"] == existing_id


def test_list_and_get_draft(client, restaurant_a) -> None:
    content = SAMPLE_XML.read_bytes()
    create = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )
    draft_id = create.json()["id"]

    listing = client.get(f"/entities/{restaurant_a.id}/invoices/drafts")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["id"] == draft_id

    single = client.get(f"/entities/{restaurant_a.id}/invoices/drafts/{draft_id}")
    assert single.status_code == 200
    assert single.json()["invoice_number"] == "EF2026000123"


def test_cross_entity_draft_isolation(
    client, restaurant_a, restaurant_b
) -> None:
    content = SAMPLE_XML.read_bytes()
    create = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )
    draft_id = create.json()["id"]

    list_b = client.get(f"/entities/{restaurant_b.id}/invoices/drafts")
    assert list_b.status_code == 200
    assert list_b.json()["total"] == 0

    get_b = client.get(f"/entities/{restaurant_b.id}/invoices/drafts/{draft_id}")
    assert get_b.status_code == 404


def test_same_file_allowed_for_different_entities(
    client, restaurant_a, restaurant_b
) -> None:
    content = SAMPLE_XML.read_bytes()

    a = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )
    b = client.post(
        f"/entities/{restaurant_b.id}/invoices/efatura/draft",
        files={"file": ("sample.xml", content, "application/xml")},
    )
    assert a.status_code == 201
    assert b.status_code == 201
    assert a.json()["id"] != b.json()["id"]
    assert a.json()["file_fingerprint"] == b.json()["file_fingerprint"]


def test_rls_hides_other_entity_drafts(db_session, restaurant_a, restaurant_b) -> None:
    from app.features.invoices import service

    content = SAMPLE_XML.read_bytes()
    service.create_efatura_draft_from_upload(db_session, restaurant_a.id, content)

    with entity_context(db_session, restaurant_b.id):
        visible = list(db_session.scalars(select(InvoiceDraft)))
        assert visible == []


def test_pdf_fixture_registry(client, restaurant_a) -> None:
    pdf_bytes = b"%PDF-1.4 test-fixture-pdf-content"
    register_pdf_fixture(
        pdf_bytes,
        {
            "supplier_name": "Test Supplier Ltd",
            "supplier_vkn": "9876543210",
            "invoice_number": "PDF-2026-99",
            "invoice_date": date(2026, 1, 10),
            "net_kurus": 50_000,
            "gross_kurus": 60_000,
            "vat_breakdown": [{"rate_percent": 20, "base_kurus": 50_000, "vat_kurus": 10_000}],
            "currency": "TRY",
        },
    )

    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("invoice.pdf", pdf_bytes, "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["source_type"] == "efatura_pdf"
    assert body["invoice_number"] == "PDF-2026-99"
    assert body["status"] == "draft"


def test_unknown_entity_returns_404(client) -> None:
    import uuid

    fake_id = uuid.uuid4()
    response = client.post(
        f"/entities/{fake_id}/invoices/efatura/draft",
        files={"file": ("sample.xml", SAMPLE_XML.read_bytes(), "application/xml")},
    )
    assert response.status_code == 404
