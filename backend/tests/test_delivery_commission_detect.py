"""Delivery commission detection from e-Fatura extraction."""

from __future__ import annotations

from app.adapters.ocr_ai.efatura import EInvoiceExtraction
from app.core.delivery.commission_detect import (
    classify_efatura_intake,
    is_delivery_commission_extraction,
    match_delivery_platform,
)
from app.features.invoices.models import InvoiceKind
from tests.delivery_helpers import delivery_setup as build_delivery_setup


def _extraction(*, supplier_name: str = "Getir Perakende A.S.") -> EInvoiceExtraction:
    return EInvoiceExtraction(
        supplier_name=supplier_name,
        supplier_vkn="3940482658",
        invoice_number="GTR-1",
        invoice_date=__import__("datetime").date(2026, 5, 1),
        net_kurus=80_000,
        gross_kurus=96_000,
        vat_breakdown=[
            {"rate_percent": 20, "base_kurus": 80_000, "vat_kurus": 16_000},
        ],
    )


def test_komisyon_text_detected_as_commission() -> None:
    text = "Komisyon Bedeli\nHesaplanan KDV (% 20) 1.600,00 TL"
    assert is_delivery_commission_extraction(_extraction(), pdf_text=text) is True


def test_supply_layout_not_commission() -> None:
    text = (
        "Depo: Istanbul\n"
        "000000000001008024 Balkan yogurt 6,00 Adet 154,95 TL\n"
        "000000000001008455 Sütaş Ayran 4,00 Adet 106,92 TL\n"
        "000000000001007320 Nonwoven Poşet 2,00 Adet 1,36 TL\n"
    )
    assert is_delivery_commission_extraction(_extraction(), pdf_text=text) is False


def test_yemeksepeti_hizmet_bedeli_detected_as_commission() -> None:
    text = (
        "Sipariş İletim Hizmet Bedeli  1 Adet  4.648,20 TL\n"
        "Dağıtım Hizmet Bedeli  1 Adet  7.747,00 TL\n"
    )
    extraction = EInvoiceExtraction(
        supplier_name=None,
        supplier_vkn="9470457468",
        invoice_number="YS-1",
        invoice_date=__import__("datetime").date(2026, 5, 1),
        net_kurus=12_406,
        gross_kurus=14_887,
        vat_breakdown=[{"rate_percent": 20, "base_kurus": 12_406, "vat_kurus": 2_481}],
    )
    classification = classify_efatura_intake(extraction, pdf_text=text)
    assert classification.invoice_kind == InvoiceKind.DELIVERY_COMMISSION.value
    assert classification.confidence == "high"


def test_getir_vkn_without_markers_needs_review() -> None:
    text = "Generic invoice body without fee lines or depo markers"
    classification = classify_efatura_intake(_extraction(), pdf_text=text)
    assert classification.invoice_kind == InvoiceKind.SUPPLIER.value
    assert classification.confidence == "medium"
    assert classification.review_reason is not None


def test_match_platform_by_supplier_name(db_session, restaurant_a) -> None:
    setup = build_delivery_setup(db_session, restaurant_a.id, platform_names=("Getir",))
    platform = match_delivery_platform(
        db_session,
        setup["entity_id"],
        supplier_name="Getir Perakende Ticaret A.S.",
        supplier_vkn="3940482658",
    )
    assert platform is not None
    assert platform.name == "Getir"
