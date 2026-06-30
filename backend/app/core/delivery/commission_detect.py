"""Detect delivery platform commission e-Faturas and match entity platforms."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.adapters.ocr_ai.efatura import EInvoiceExtraction
from app.db.session import entity_context, require_entity_context
from app.features.delivery.models import OwnedDeliveryPlatform
from app.features.invoices.models import InvoiceKind

ClassificationConfidence = Literal["high", "medium", "low"]

_PLATFORM_ALIASES: dict[str, tuple[str, ...]] = {
    "getir": ("getir", "getir perakende"),
    "yemeksepeti": ("yemeksepeti", "yemek sepeti", "yemeksepeti elektronik"),
    "migros": ("migros", "migros yemek"),
    "trendyol": ("trendyol", "trendyol go", "trendyolgo"),
}

_KNOWN_PLATFORM_VKNS: dict[str, tuple[str, ...]] = {
    "getir": ("3940482658",),
    "yemeksepeti": ("9470457468",),
}

_YEMEKSEPETI_VKN = "9470457468"
_GETIR_VKN = "3940482658"

_COMMISSION_SERVICE_PATTERNS = (
    re.compile(r"komisyon\s+bedeli", re.IGNORECASE),
    re.compile(r"komisyon\s+fatur", re.IGNORECASE),
    re.compile(r"sipari[sş]\s*iletim\s+hizmet\s+bedeli", re.IGNORECASE),
    re.compile(r"da[gğ][ıi]t[ıi]m\s+hizmet\s+bedeli", re.IGNORECASE),
)

_PRODUCT_SKU_LINE = re.compile(
    r"\d{10,}.*?\badet\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class EfaturaIntakeClassification:
    invoice_kind: str
    confidence: ClassificationConfidence
    review_reason: str | None = None


def _normalize_name(value: str | None) -> str:
    return (value or "").casefold()


def _pdf_text(extraction: EInvoiceExtraction, pdf_text: str | None) -> str:
    if pdf_text:
        return pdf_text
    if extraction.raw:
        sample = extraction.raw.get("text_sample")
        if isinstance(sample, str):
            return sample
    return ""


def _has_hizmet_commission_lines(text: str) -> bool:
    lowered = text.casefold()
    return (
        "sipariş iletim hizmet bedeli" in lowered
        or "siparis iletim hizmet bedeli" in lowered
        or "dağıtım hizmet bedeli" in lowered
        or "dagitim hizmet bedeli" in lowered
    )


def _has_komisyon_marker(text: str, supplier_name: str | None) -> bool:
    lowered = _normalize_name(text)
    supplier = _normalize_name(supplier_name)
    if "komisyon" in lowered or "komisyon" in supplier:
        return True
    for pattern in _COMMISSION_SERVICE_PATTERNS:
        if pattern.search(text):
            return True
    return False


def _count_product_sku_lines(text: str) -> int:
    lowered = text.casefold()
    count = 0
    for line in lowered.splitlines():
        if "hizmet bedeli" in line:
            continue
        if _PRODUCT_SKU_LINE.search(line):
            count += 1
    return count


def _has_mixed_low_kdv(extraction: EInvoiceExtraction) -> bool:
    rates: set[int] = set()
    for row in extraction.vat_breakdown or []:
        try:
            rates.add(int(round(float(row.get("rate_percent", 0)))))
        except (TypeError, ValueError):
            continue
    return 1 in rates and 10 in rates


def _looks_like_supply_invoice(
    text: str,
    extraction: EInvoiceExtraction | None = None,
) -> bool:
    """Multi-line grocery/supply layouts — not platform commission."""
    lowered = text.casefold()
    if "depo:" in lowered or "depo :" in lowered:
        return True

    product_lines = _count_product_sku_lines(text)
    if product_lines >= 3:
        return True

    if extraction is not None and _has_mixed_low_kdv(extraction) and product_lines >= 2:
        return True

    return False


def _is_yemeksepeti_hizmet_commission(
    text: str,
    extraction: EInvoiceExtraction,
) -> bool:
    if not _has_hizmet_commission_lines(text):
        return False
    vkn = (extraction.supplier_vkn or "").strip()
    supplier = _normalize_name(extraction.supplier_name)
    if vkn == _YEMEKSEPETI_VKN:
        return True
    return any(alias in supplier for alias in _PLATFORM_ALIASES["yemeksepeti"])


def classify_efatura_intake(
    extraction: EInvoiceExtraction,
    *,
    pdf_text: str | None = None,
) -> EfaturaIntakeClassification:
    """Deterministic supplier vs delivery commission classification with confidence."""
    text = _pdf_text(extraction, pdf_text)

    if _looks_like_supply_invoice(text, extraction):
        return EfaturaIntakeClassification(InvoiceKind.SUPPLIER.value, "high")

    if _has_komisyon_marker(text, extraction.supplier_name):
        return EfaturaIntakeClassification(
            InvoiceKind.DELIVERY_COMMISSION.value,
            "high",
        )

    if _is_yemeksepeti_hizmet_commission(text, extraction):
        return EfaturaIntakeClassification(
            InvoiceKind.DELIVERY_COMMISSION.value,
            "high",
        )

    vkn = (extraction.supplier_vkn or "").strip()
    if vkn == _GETIR_VKN:
        return EfaturaIntakeClassification(
            InvoiceKind.SUPPLIER.value,
            "medium",
            "Getir invoice — confirm supplier expense vs delivery commission",
        )

    return EfaturaIntakeClassification(InvoiceKind.SUPPLIER.value, "high")


def is_delivery_commission_extraction(
    extraction: EInvoiceExtraction,
    *,
    pdf_text: str | None = None,
) -> bool:
    """True when the document is a platform commission fee invoice."""
    return (
        classify_efatura_intake(extraction, pdf_text=pdf_text).invoice_kind
        == InvoiceKind.DELIVERY_COMMISSION.value
    )


def match_delivery_platform(
    session: Session,
    entity_id: uuid.UUID,
    *,
    supplier_name: str | None,
    supplier_vkn: str | None,
) -> OwnedDeliveryPlatform | None:
    """Match seller identity to an entity delivery platform by name or known VKN."""
    name = _normalize_name(supplier_name)
    vkn = (supplier_vkn or "").strip()

    with entity_context(session, entity_id):
        require_entity_context()
        platforms = session.scalars(
            select(OwnedDeliveryPlatform).where(OwnedDeliveryPlatform.is_active.is_(True))
        ).all()

    if not platforms:
        return None

    if vkn:
        for platform in platforms:
            key = _normalize_name(platform.name)
            for known in _KNOWN_PLATFORM_VKNS.get(key, ()):
                if vkn == known:
                    return platform

    for platform in platforms:
        key = _normalize_name(platform.name)
        aliases = _PLATFORM_ALIASES.get(key, (key,))
        for alias in aliases:
            if alias in name or (name and name in alias):
                return platform
        if key in name or (name and name in key):
            return platform

    return None
