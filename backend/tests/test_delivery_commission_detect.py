"""Delivery commission detection from e-Fatura extraction."""

from __future__ import annotations

from app.adapters.ocr_ai.efatura import EInvoiceExtraction
from app.core.delivery.commission_detect import (
    is_delivery_commission_extraction,
    match_delivery_platform,
)
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
        "Mal Hizmet\nÜrün Adı\nDepo: Istanbul\n"
        "yogurt\npeynir\nKomisyon yok"
    )
    assert is_delivery_commission_extraction(_extraction(), pdf_text=text) is False


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
