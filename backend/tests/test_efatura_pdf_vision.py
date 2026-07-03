"""IE-B — AI vision extraction fallback for unreadable/scanned PDFs."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.adapters.ocr_ai.efatura import (
    EInvoiceExtraction,
    PdfIntakeResult,
    _vision_intake_review_reason,
    extract_efatura_pdf_for_intake,
)
from app.core.chart_of_accounts.models import Account
from app.core.chart_of_accounts.seed import seed_default_chart
from app.core.turkish_vkn import is_valid_tckn, is_valid_vkn, is_valid_vkn_or_tckn
from app.db.session import entity_context
from tests.test_efatura_pdf_intake import NO_TEXT_PDF
from tests.test_invoice_auto_post import _enable_auto_post, _seed_expense_learning

SUPPLIER_VKN = "6200031354"
BUYER_VKN = "7342656849"


@pytest.fixture
def seeded_accounts(db_session, restaurant_a):
    seed_default_chart(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        accounts = list(db_session.scalars(select(Account)))
    return {account.code: account.id for account in accounts}


def _high_confidence_confidences() -> dict[str, str]:
    return {
        "supplier_name": "high",
        "supplier_vkn": "high",
        "invoice_number": "high",
        "invoice_date": "high",
        "net_kurus": "high",
        "gross_kurus": "high",
        "vat_breakdown": "high",
    }


def _vision_extraction(
    *,
    net_kurus: int = 100_000,
    gross_kurus: int = 120_000,
    supplier_vkn: str = SUPPLIER_VKN,
    confidences: dict[str, str] | None = None,
    vat_breakdown: list[dict[str, int | float]] | None = None,
) -> EInvoiceExtraction:
    if vat_breakdown is None:
        vat_kurus = gross_kurus - net_kurus
        vat_breakdown = [
            {"rate_percent": 20.0, "base_kurus": net_kurus, "vat_kurus": vat_kurus},
        ]
    return EInvoiceExtraction(
        supplier_name="Metro Gıda",
        supplier_vkn=supplier_vkn,
        invoice_number="VIS-2026-001",
        invoice_date=date(2026, 2, 17),
        net_kurus=net_kurus,
        gross_kurus=gross_kurus,
        vat_breakdown=vat_breakdown,
        raw={
            "source": "vision",
            "model": "gpt-4o-mini",
            "confidences": confidences or _high_confidence_confidences(),
            "vision_response": True,
        },
    )


def test_turkish_vkn_checksum_validates_real_ids() -> None:
    assert is_valid_vkn(SUPPLIER_VKN)
    assert is_valid_vkn(BUYER_VKN)
    assert is_valid_vkn_or_tckn(SUPPLIER_VKN)
    assert not is_valid_vkn("1000000001")
    assert is_valid_tckn("10000000146")


def test_vision_intake_review_reason_success() -> None:
    extraction = _vision_extraction()
    assert _vision_intake_review_reason(extraction, buyer_vkn=BUYER_VKN) is None


def test_vision_intake_review_reason_totals_mismatch() -> None:
    extraction = _vision_extraction(
        net_kurus=100_000,
        gross_kurus=120_000,
        vat_breakdown=[
            {"rate_percent": 20.0, "base_kurus": 100_000, "vat_kurus": 10_000},
        ],
    )
    assert (
        _vision_intake_review_reason(extraction, buyer_vkn=BUYER_VKN)
        == "vision_totals_mismatch"
    )


def test_vision_intake_review_reason_invalid_vkn() -> None:
    extraction = _vision_extraction(supplier_vkn="1000000001")
    assert (
        _vision_intake_review_reason(extraction, buyer_vkn=BUYER_VKN)
        == "vision_invalid_vkn"
    )


def test_vision_intake_review_reason_supplier_matches_buyer() -> None:
    extraction = _vision_extraction(supplier_vkn=BUYER_VKN)
    assert (
        _vision_intake_review_reason(extraction, buyer_vkn=BUYER_VKN)
        == "vision_invalid_vkn"
    )


def test_no_text_pdf_vision_success_intake(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_efatura_vision",
        lambda _content: _vision_extraction(),
    )
    result = extract_efatura_pdf_for_intake(NO_TEXT_PDF, buyer_vkn=BUYER_VKN)
    assert isinstance(result, PdfIntakeResult)
    assert result.review_reason is None
    assert result.extraction.invoice_number == "VIS-2026-001"
    assert result.extraction.net_kurus == 100_000
    assert result.extraction.gross_kurus == 120_000
    assert result.extraction.raw["source"] == "vision"


def test_no_text_pdf_vision_unconfigured_falls_back_to_ie_a(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_efatura_vision",
        lambda _content: None,
    )
    result = extract_efatura_pdf_for_intake(NO_TEXT_PDF)
    assert result.review_reason == "pdf_no_text_layer"
    assert result.extraction.invoice_number == ""


def test_upload_vision_success_creates_draft(
    client, db_session, restaurant_a, monkeypatch
) -> None:
    restaurant_a.vkn = BUYER_VKN
    db_session.commit()
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_efatura_vision",
        lambda _content: _vision_extraction(),
    )
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("scanned.pdf", NO_TEXT_PDF, "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["review_reason"] is None
    assert body["invoice_number"] == "VIS-2026-001"
    assert body["supplier_vkn"] == SUPPLIER_VKN
    assert body["net_kurus"] == 100_000
    assert body["gross_kurus"] == 120_000
    assert body["extraction_payload"]["raw"]["source"] == "vision"
    assert body["classification_confidence"] == "medium"
    assert body["one_click_post_eligible"] is False


def test_upload_vision_totals_mismatch_needs_review(
    client, db_session, restaurant_a, monkeypatch
) -> None:
    restaurant_a.vkn = BUYER_VKN
    db_session.commit()
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_efatura_vision",
        lambda _content: _vision_extraction(
            net_kurus=100_000,
            gross_kurus=120_000,
            vat_breakdown=[
                {"rate_percent": 20.0, "base_kurus": 100_000, "vat_kurus": 10_000},
            ],
        ),
    )
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("scanned.pdf", NO_TEXT_PDF, "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "needs_review"
    assert "vision_totals_mismatch" in body["review_reason"]
    assert body["classification_confidence"] == "low"
    assert body["one_click_post_eligible"] is False


def test_upload_vision_low_confidence_needs_review(
    client, db_session, restaurant_a, monkeypatch
) -> None:
    restaurant_a.vkn = BUYER_VKN
    db_session.commit()
    confidences = _high_confidence_confidences()
    confidences["invoice_number"] = "low"
    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_efatura_vision",
        lambda _content: _vision_extraction(confidences=confidences),
    )
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("scanned.pdf", NO_TEXT_PDF, "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "needs_review"
    assert "vision_low_confidence" in body["review_reason"]


def test_upload_vision_success_blocks_auto_post(
    client,
    db_session,
    restaurant_a,
    seeded_accounts,
    monkeypatch,
) -> None:
    from app.features.suppliers.models import Supplier

    restaurant_a.vkn = BUYER_VKN
    db_session.commit()
    _enable_auto_post(db_session, restaurant_a.id)
    with entity_context(db_session, restaurant_a.id):
        supplier = Supplier(name="Metro Gida", vkn=SUPPLIER_VKN)
        db_session.add(supplier)
        db_session.commit()
        supplier_id = supplier.id

    _seed_expense_learning(
        db_session,
        restaurant_a,
        supplier_id,
        seeded_accounts["5220"],
    )

    monkeypatch.setattr(
        "app.adapters.ocr_ai.efatura._extract_efatura_vision",
        lambda _content: _vision_extraction(),
    )
    response = client.post(
        f"/entities/{restaurant_a.id}/invoices/efatura/draft",
        files={"file": ("scanned.pdf", NO_TEXT_PDF, "application/pdf")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["posted_by_rule_auto"] is False
    assert body["one_click_post_eligible"] is False
